export interface VectorChunk {
    id: string;
    documentId: string;
    text: string;
    vector: number[];
    metadata: Record<string, any>;
    tenantId: string;
}

export interface SearchResult {
    id: string;
    documentId: string;
    text: string;
    score: number;
    metadata: Record<string, any>;
}

export interface VectorStore {
    /**
     * Store chunks and vectors.
     * Must be idempotent (upsert).
     */
    upsertChunks(chunks: VectorChunk[]): Promise<void>;

    /**
     * Search for similar vectors.
     * @param queryVector The embedding vector of the search query.
     * @param limit Max results to return.
     * @param tenantId Tenant ID for isolation.
     * @param filter Optional metadata filters (e.g. labels).
     */
    search(queryVector: number[], limit: number, tenantId: string, filter?: Record<string, any>): Promise<SearchResult[]>;

    /**
     * Delete all chunks for a specific document.
     */
    deleteDocumentChunks(documentId: string, tenantId: string): Promise<void>;

    /**
     * Atomically replace all chunks for a document.
     * Deletes existing chunks and inserts new ones in a transaction (if supported).
     */
    replaceChunks(documentId: string, tenantId: string, chunks: VectorChunk[]): Promise<void>;
}
