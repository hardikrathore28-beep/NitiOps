
import { createService, startService, logger, audit } from '@nitiops/service-template';
import { governedRoute } from '@nitiops/governed-http';
import { Request, Response } from 'express';
import { createDb, chunks, embeddings, documents, documentText, sql, eq } from '@nitiops/database';
import { chunkText } from './chunker';
import { getEmbeddingProvider } from './embeddingProvider';
import { getVectorStore } from './storeFactory';
import { cite } from './citation';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const app = createService('rag-service');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3005;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/nitiops';
const db = createDb(DATABASE_URL);

const embeddingProvider = getEmbeddingProvider();

// Helper to transform actor from governed-http format to audit schema format
const toAuditActor = (actor: any) => {
    if (!actor) return { id: 'unknown', type: 'service' };
    return {
        id: actor.actor_id || actor.id || 'unknown',
        type: actor.type || 'user'
    };
};

// --- 1. INDEXING ENDPOINT ---
app.post('/rag/index/:document_id', governedRoute({
    action: 'rag.index',
    resourceResolver: (req) => ({
        type: 'document',
        id: req.params.document_id,
        context: { op: 'index' }
    }),
    privileged: true,
    purposeRequired: true
}, async (req: Request, res: Response) => {
    const { document_id } = req.params;

    try {
        logger.info(`Starting indexing for document ${document_id}`);

        // 1. Fetch text
        // Note: We need both document metadata (for tenant_id/labels) and text
        const docResult = await db.select().from(documents).where(eq(documents.document_id, document_id));
        if (docResult.length === 0) return res.status(404).json({ error: 'Document not found' });
        const doc = docResult[0];

        const textResult = await db.select().from(documentText).where(eq(documentText.document_id, document_id));
        if (textResult.length === 0) return res.status(400).json({ error: 'No extracted text found for document' });
        const textRow = textResult[0];

        // 2. Chunk
        const chunkList = chunkText(textRow.extracted_text);
        logger.info(`Generated ${chunkList.length} chunks`);

        // 3. Embed
        const textsToEmbed = chunkList.map(c => c.text);
        const vectors = await embeddingProvider.embed(textsToEmbed);

        // 4. Store via Abstraction
        const vectorStore = getVectorStore(db);

        const vectorChunks = chunkList.map((chunkData, i) => ({
            id: uuidv4(),
            documentId: document_id,
            tenantId: doc.tenant_id,
            text: chunkData.text,
            vector: vectors[i],
            metadata: {
                chunk_index: i,
                token_count: chunkData.token_count,
                provenance: chunkData.provenance,
                labels: (doc.classification as any) || {}
            }
        }));

        // Atomic replace (where supported)
        await vectorStore.replaceChunks(document_id, doc.tenant_id, vectorChunks);

        // Update Document Version & Status
        await db.update(documents)
            .set({
                status: 'indexed',
                version: (doc.version || 1) + 1,
                updated_at: new Date()
            })
            .where(eq(documents.document_id, document_id));

        // 5. Audit
        await audit({
            tenant_id: doc.tenant_id,
            event_type: 'RAG_INDEX_COMPLETE',
            actor: toAuditActor((req as any).actor),
            purpose: (req.headers['x-purpose'] as string) || 'indexing',
            context: { document_id, chunk_count: chunkList.length, store: process.env.VECTOR_STORE_PROVIDER || 'pgvector' },
            timestamp: new Date().toISOString()
        });

        res.json({ status: 'indexed', chunks: chunkList.length });

    } catch (err: any) {
        logger.error('Indexing failed', err);
        res.status(500).json({ error: err.message });
    }
}));


// --- 2. SEARCH ENDPOINT ---
app.post('/rag/search', governedRoute({
    action: 'rag.search',
    resourceResolver: (req) => ({
        type: 'knowledge-base',
        id: 'global',
        context: { query_length: req.body.query?.length }
    }),
    privileged: true,
    purposeRequired: true
}, async (req: Request, res: Response) => {
    const { query, top_k = 5, filters } = req.body;
    const actor = (req as any).actor;
    const tenant_id = req.headers['x-tenant-id'] || (actor?.context?.tenant_id);

    if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required for search' });
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        // 1. Embed Query
        const [queryVector] = await embeddingProvider.embed([query]);

        // 2. Vector Search via Abstraction
        const candidateLimit = (top_k as number) * 5;
        const vectorStore = getVectorStore(db);

        const candidates = await vectorStore.search(queryVector, candidateLimit, tenant_id as string, filters);

        // 3. Authorization Filtering (Chunk Level)
        const policyUrl = process.env.POLICY_SERVICE_URL || 'http://policy-service:3002';
        const purpose = req.headers['x-purpose'];

        const authChecks = candidates.map(async (candidate) => {
            try {
                const checkRes = await axios.post(`${policyUrl}/authorize`, {
                    tenant_id: tenant_id || 'unknown',
                    actor: actor,
                    action: 'chunk.read',
                    resource: {
                        type: 'chunk',
                        id: candidate.id,
                        labels: candidate.metadata || {},
                        sensitivity: (candidate.metadata as any)?.sensitivity
                    },
                    purpose: purpose,
                    context: { time: new Date().toISOString() }
                });

                if (checkRes.data.allow) {
                    return candidate;
                }
            } catch (e) {
                logger.error('Auth check failed for chunk', { chunk_id: candidate.id, error: e });
            }
            return undefined;
        });

        const checked = await Promise.all(authChecks);
        const filtered = checked.filter(c => c !== undefined).slice(0, top_k as number);

        // 4. Audit Search
        await audit({
            tenant_id: tenant_id as string,
            event_type: 'RAG_SEARCH_RESULT',
            actor: toAuditActor(actor),
            purpose: purpose as string || 'search',
            context: {
                query_snippet: query.substring(0, 50),
                result_count: filtered.length,
                chunk_ids: filtered.map(c => c!.id),
                store: process.env.VECTOR_STORE_PROVIDER || 'pgvector'
            },
            timestamp: new Date().toISOString()
        });

        res.json({
            results: filtered.map(c => ({
                ...c,
                citation: cite(c)
            }))
        });

    } catch (err: any) {
        logger.error('Search failed', err);
        res.status(500).json({ error: err.message });
    }
}));


startService(app, PORT);
