import { VectorStore, VectorChunk, SearchResult } from './vectorStore.interface';
import { Pinecone } from '@pinecone-database/pinecone';

export class PineconeStore implements VectorStore {
    private client: Pinecone;
    private indexName: string;

    constructor() {
        const apiKey = process.env.PINECONE_API_KEY;
        if (!apiKey) throw new Error('PINECONE_API_KEY not set');
        this.client = new Pinecone({ apiKey });
        this.indexName = process.env.PINECONE_INDEX || 'nitiops';
    }

    private getIndex(tenantId: string) {
        // Use namespaces for tenant isolation
        return this.client.index(this.indexName).namespace(tenantId);
    }

    async upsertChunks(vectorChunks: VectorChunk[]): Promise<void> {
        // Group by tenant (though upsertChunks usually receives for one tenant context)
        // Assumption: All chunks typically belong to one tenant in a single flow.
        if (vectorChunks.length === 0) return;
        const tenantId = vectorChunks[0].tenantId;

        const records = vectorChunks.map(chunk => ({
            id: chunk.id,
            values: chunk.vector,
            metadata: {
                ...chunk.metadata,
                documentId: chunk.documentId,
                text: chunk.text // Pinecone supports metadata text, but limited size. Ensure within limits.
            }
        }));

        // Batching might be needed for large sets (Pinecone recommends ~100-500)
        const batchSize = 100;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            await this.getIndex(tenantId).upsert(batch);
        }
    }

    async search(queryVector: number[], limit: number, tenantId: string, filter?: Record<string, any>): Promise<SearchResult[]> {
        const index = this.getIndex(tenantId);

        // Pinecone metadata filter
        // e.g. { "labels.sensitivity": "public" }
        // Flattened structure or nested depends on how we stored it.
        // We stored ...chunk.metadata.
        const response = await index.query({
            vector: queryVector,
            topK: limit,
            includeMetadata: true,
            filter: filter // Pass directly if compatible, otherwise map.
        });

        return response.matches.map(match => ({
            id: match.id,
            documentId: match.metadata ? String(match.metadata.documentId) : '',
            text: match.metadata ? String(match.metadata.text) : '',
            score: match.score || 0,
            metadata: match.metadata as Record<string, any>
        }));
    }

    async deleteDocumentChunks(documentId: string, tenantId: string): Promise<void> {
        console.log(`[Pinecone] Delete chunks for doc ${documentId}`);
        const index = this.getIndex(tenantId);
        // Delete by metadata filter
        await index.deleteMany({
            documentId: { $eq: documentId }
        });
    }

    async replaceChunks(documentId: string, tenantId: string, chunks: VectorChunk[]): Promise<void> {
        await this.deleteDocumentChunks(documentId, tenantId);
        await this.upsertChunks(chunks);
    }
}
