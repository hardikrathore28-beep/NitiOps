import { VectorStore, VectorChunk, SearchResult } from './vectorStore.interface';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';

export class QdrantStore implements VectorStore {
    private client: QdrantClient;
    private collectionName = 'nitiops_chunks';

    constructor() {
        const url = process.env.QDRANT_URL || 'http://localhost:6333';
        const apiKey = process.env.QDRANT_API_KEY;
        this.client = new QdrantClient({ url, apiKey });
        this.ensureCollection();
    }

    private async ensureCollection() {
        const collections = await this.client.getCollections();
        const exists = collections.collections.find(c => c.name === this.collectionName);
        if (!exists) {
            await this.client.createCollection(this.collectionName, {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            });
        }
    }

    async upsertChunks(vectorChunks: VectorChunk[]): Promise<void> {
        if (vectorChunks.length === 0) return;

        const points = vectorChunks.map(c => ({
            id: c.id, // Qdrant prefers UUID or Int. We use UUID string.
            vector: c.vector,
            payload: {
                document_id: c.documentId,
                tenant_id: c.tenantId,
                text: c.text,
                ...c.metadata
            }
        }));

        await this.client.upsert(this.collectionName, {
            wait: true,
            points: points
        });
    }

    async search(queryVector: number[], limit: number, tenantId: string, filter?: Record<string, any>): Promise<SearchResult[]> {
        const res = await this.client.search(this.collectionName, {
            vector: queryVector,
            limit: limit,
            filter: {
                must: [
                    { key: 'tenant_id', match: { value: tenantId } }
                ]
            },
            with_payload: true
        });

        return res.map(r => ({
            id: r.id as string,
            documentId: r.payload?.document_id as string,
            text: r.payload?.text as string,
            score: r.score,
            metadata: r.payload as Record<string, any>
        }));
    }

    async deleteDocumentChunks(documentId: string, tenantId: string): Promise<void> {
        console.log(`[Qdrant] Delete chunks for doc ${documentId}`);
        await this.client.delete(this.collectionName, {
            wait: true,
            filter: {
                must: [
                    { key: 'tenant_id', match: { value: tenantId } },
                    { key: 'document_id', match: { value: documentId } }
                ]
            }
        });
    }

    async replaceChunks(documentId: string, tenantId: string, chunks: VectorChunk[]): Promise<void> {
        await this.deleteDocumentChunks(documentId, tenantId);
        await this.upsertChunks(chunks);
    }
}
