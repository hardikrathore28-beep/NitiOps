
import { createService, startService, logger, audit } from '@nitiops/service-template';
import { governedRoute } from '@nitiops/governed-http';
import { Request, Response } from 'express';
import { createDb, chunks, embeddings, documents, documentText, sql, eq } from '@nitiops/database';
import { chunkText } from './chunker';
import { getEmbeddingProvider } from './embeddingProvider';
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
        // Flatten text for batch embedding
        const textsToEmbed = chunkList.map(c => c.text);
        const vectors = await embeddingProvider.embed(textsToEmbed);

        // 4. Transactional Store (Re-index strategy)
        await db.transaction(async (tx) => {
            // Delete existing
            await tx.delete(chunks).where(eq(chunks.document_id, document_id));
            // Embeddings cascade delete via FK on chunks

            // Insert Chunks & Embeddings
            for (let i = 0; i < chunkList.length; i++) {
                const chunkData = chunkList[i];
                const vector = vectors[i];

                const [insertedChunk] = await tx.insert(chunks).values({
                    tenant_id: doc.tenant_id, // inherited from doc
                    document_id: document_id,
                    chunk_index: i,
                    text: chunkData.text,
                    token_count: chunkData.token_count,
                    provenance: chunkData.provenance,
                    labels: (doc.classification as any) || {} // Inherit classification tags
                }).returning();

                await tx.insert(embeddings).values({
                    chunk_id: insertedChunk.chunk_id,
                    embedding: vector,
                    model_name: 'stub-v1'
                });
            }
        });

        // 5. Audit
        await audit({
            tenant_id: doc.tenant_id,
            event_type: 'RAG_INDEX_COMPLETE',
            actor: toAuditActor((req as any).actor),
            purpose: (req.headers['x-purpose'] as string) || 'indexing',
            context: { document_id, chunk_count: chunkList.length },
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
        type: 'knowledge-base', // General resource for search entry
        id: 'global',
        context: { query_length: req.body.query?.length }
    }),
    privileged: true,
    purposeRequired: true
}, async (req: Request, res: Response) => {
    const { query, top_k = 5, filters } = req.body;
    const actor = (req as any).actor;
    const tenant_id = req.headers['x-tenant-id'] || (actor?.context?.tenant_id); // Basic tenant isolation assumption

    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        // 1. Embed Query
        const [queryVector] = await embeddingProvider.embed([query]);

        // 2. Vector Search (Candidate Generation)
        // Fetch top_k * 5 to allow for authz filtering
        const candidateLimit = (top_k as number) * 5;

        // Drizzle specific vector distance operator <-> (L2) or <=> (cosine) logic
        // We defined vector as customType, so we cast it for the query
        // "embedding <-> '[...]'::vector"

        const vectorStr = JSON.stringify(queryVector);

        // Note: filters would apply here for pre-filtering (tenant_id mandatory)
        // In real app we MUST filter by tenant_id at DB layer first!
        // Assuming simple single-tenant per request context or derived from actor
        // We'll enforce filtering by tenant_id if available (it should be for multi-tenant safety)

        let queryBuilder = db.select({
            chunk_id: chunks.chunk_id,
            document_id: chunks.document_id,
            text: chunks.text,
            provenance: chunks.provenance,
            labels: chunks.labels,
            score: sql<number>`1 - (embedding <=> ${vectorStr}::vector)` // Cosine similarity
        })
            .from(embeddings)
            .innerJoin(chunks, eq(embeddings.chunk_id, chunks.chunk_id))
            .orderBy(sql`embedding <=> ${vectorStr}::vector`)
            .limit(candidateLimit);

        if (tenant_id) {
            queryBuilder.where(eq(chunks.tenant_id, tenant_id as string));
        }

        const candidates = await queryBuilder;

        // 3. Authorization Filtering (Chunk Level)
        const allowedChunks = [];
        const policyUrl = process.env.POLICY_SERVICE_URL || 'http://policy-service:3002';
        const purpose = req.headers['x-purpose'];

        // Optimize: Batch Check? (Policy Service needs batch endpoint, which we didn't firmly spec in step 4 walkthrough,
        // but typically we do sequential or parallel promises here for MVP).
        // Let's do parallel with Promise.all for speed, fail-closed if any error? 
        // No, fail-closed per item.

        const authChecks = candidates.map(async (chunk) => {
            try {
                const checkRes = await axios.post(`${policyUrl}/authorize`, {
                    tenant_id: tenant_id || 'unknown', // should ideally come from chunk if mixed
                    actor: actor,
                    action: 'chunk.read',
                    resource: {
                        type: 'chunk',
                        id: chunk.chunk_id,
                        labels: chunk.labels,
                        sensitivity: (chunk.labels as any)?.sensitivity
                    },
                    purpose: purpose,
                    context: { time: new Date().toISOString() }
                });

                if (checkRes.data.allow) {
                    return chunk;
                }
            } catch (e) {
                logger.error('Auth check failed for chunk', { chunk_id: chunk.chunk_id, error: e });
                // Fail closed -> returns undefined
            }
            return undefined;
        });

        const checked = await Promise.all(authChecks);
        const filtered = checked.filter(c => c !== undefined).slice(0, top_k as number);

        // 4. Audit Search
        await audit({
            tenant_id: tenant_id as string || 'unknown',
            event_type: 'RAG_SEARCH_RESULT',
            actor: toAuditActor(actor),
            purpose: purpose as string || 'search',
            context: {
                query_snippet: query.substring(0, 50),
                result_count: filtered.length,
                chunk_ids: filtered.map(c => c!.chunk_id)
            },
            timestamp: new Date().toISOString()
        });

        res.json({ results: filtered });

    } catch (err: any) {
        logger.error('Search failed', err);
        res.status(500).json({ error: err.message });
    }
}));


startService(app, PORT);
