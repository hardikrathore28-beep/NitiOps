export interface RawDocument {
    sourceId: string;
    sourceUri: string; // unique identifier within source (e.g., s3://bucket/key or file:///path)
    title: string;
    content: Buffer;
    contentType: string; // 'application/pdf', 'text/plain', etc.
    metadata: Record<string, any>; // file stats, headers, etc.
    hash?: string; // eTag or file hash if available
}

export interface ConnectorResponse {
    docs: AsyncIterable<RawDocument>;
    newCursor?: any;
}

export interface Connector {
    /**
     * Fetch documents from source.
     * @param config - Source configuration (from DB)
     * @param cursor - Last sync state (for incremental sync)
     */
    fetch(config: any, cursor?: any): AsyncIterable<RawDocument>;

    /**
     * Test connection to source.
     * @param config - Source configuration
     */
    testConnection(config: any): Promise<boolean>;
}
