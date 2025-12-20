import { VectorStore, VectorChunk, SearchResult } from './vectorStore.interface';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

export class MilvusStore implements VectorStore {
    private client: MilvusClient;
    private collectionName = 'nitiops_chunks';

    constructor() {
        const address = process.env.MILVUS_ADDRESS || 'localhost:19530';
        const username = process.env.MILVUS_USERNAME;
        const password = process.env.MILVUS_PASSWORD;

        this.client = new MilvusClient({ address, username, password });
        this.ensureCollection();
    }

    private async ensureCollection() {
        const hasCollection = await this.client.hasCollection({ collection_name: this.collectionName });
        if (!hasCollection.value) {
            await this.client.createCollection({
                collection_name: this.collectionName,
                fields: [
                    { name: 'id', data_type: DataType.VarChar, max_length: 64, is_primary_key: true },
                    { name: 'document_id', data_type: DataType.VarChar, max_length: 64 },
                    { name: 'tenant_id', data_type: DataType.VarChar, max_length: 64, is_partition_key: true }, // Partition by Tenant
                    { name: 'vector', data_type: DataType.FloatVector, dim: 1536 },
                    { name: 'text', data_type: DataType.VarChar, max_length: 8192 }, // Warning: Milvus has limits
                    { name: 'metadata', data_type: DataType.JSON }
                ]
            });
            // Create Index
            await this.client.createIndex({
                collection_name: this.collectionName,
                field_name: 'vector',
                extra_params: { metric_type: 'COSINE', index_type: 'IVF_FLAT', params: JSON.stringify({ nlist: 1024 }) }
            });
            await this.client.loadCollectionSync({ collection_name: this.collectionName });
        }
    }

    async upsertChunks(vectorChunks: VectorChunk[]): Promise<void> {
        if (vectorChunks.length === 0) return;

        const data = vectorChunks.map(c => ({
            id: c.id,
            document_id: c.documentId,
            tenant_id: c.tenantId,
            vector: c.vector,
            text: c.text,
            metadata: c.metadata
        }));

        await this.client.insert({
            collection_name: this.collectionName,
            data: data
        });
    }

    async search(queryVector: number[], limit: number, tenantId: string, filter?: Record<string, any>): Promise<SearchResult[]> {
        // Expression for filtering
        let expr = `tenant_id == "${tenantId}"`;
        // Add other filters if needed

        const res = await this.client.search({
            collection_name: this.collectionName,
            data: [queryVector], // Milvus expects data: number[][] for search
            limit: limit,
            output_fields: ['text', 'document_id', 'metadata', 'id'],
            filter: expr,
            consistency_level: 'Strong' as any
        });

        return res.results.map(r => ({
            id: r.id,
            documentId: r.document_id,
            text: r.text,
            score: r.score,
            metadata: r.metadata
        }));
    }

    async deleteDocumentChunks(documentId: string, tenantId: string): Promise<void> {
        console.log(`[Milvus] Delete chunks for doc ${documentId}`);
        await this.client.delete({
            collection_name: this.collectionName,
            filter: `tenant_id == "${tenantId}" && document_id == "${documentId}"`
        });
    }

    async replaceChunks(documentId: string, tenantId: string, chunks: VectorChunk[]): Promise<void> {
        await this.deleteDocumentChunks(documentId, tenantId);
        await this.upsertChunks(chunks);
    }
}
