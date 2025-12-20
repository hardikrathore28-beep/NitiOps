import axios from 'axios';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://rag-service:3005';

export interface RetrievedChunk {
    id: string;
    documentId: string;
    text: string;
    score: number;
    metadata: any;
    citation: any;
}

export async function retrieveContext(
    query: string,
    tenantId: string,
    authToken: string,
    limit: number = 5,
    filters?: any
): Promise<RetrievedChunk[]> {
    try {
        const response = await axios.post(`${RAG_SERVICE_URL}/rag/search`, {
            query,
            top_k: limit,
            filters
        }, {
            headers: {
                'Authorization': authToken, // Pass through original token for policy checks
                'x-tenant-id': tenantId,
                'x-purpose': 'rag-generation' // Chained purpose
            }
        });

        // rag-service returns { results: [...] }
        return response.data.results || [];

    } catch (err: any) {
        console.error('RAG Retrieval failed:', err.message);
        // Fail open or closed? 
        // If we can't retrieve, we can't ground. Fail closed for RAG mode.
        throw new Error(`RAG Retrieval failed: ${err.message}`);
    }
}

export function formatContext(chunks: RetrievedChunk[]): string {
    return chunks.map((c, i) => {
        // [doc_id:chunk_id] Content
        return `[${c.documentId}:${c.id}] ${c.text}`;
    }).join('\n\n');
}
