import { VectorStore } from './stores/vectorStore.interface';
import { PgVectorStore } from './stores/pgVectorStore';
import { PineconeStore } from './stores/pineconeStore';
import { MilvusStore } from './stores/milvusStore';
import { QdrantStore } from './stores/qdrantStore';

export function getVectorStore(dbInstance?: any): VectorStore {
    const provider = process.env.VECTOR_STORE_PROVIDER || 'pgvector';

    switch (provider.toLowerCase()) {
        case 'pinecone':
            return new PineconeStore();
        case 'milvus':
            return new MilvusStore();
        case 'qdrant':
            return new QdrantStore();
        case 'pgvector':
        default:
            return new PgVectorStore(dbInstance);
    }
}
