import { VectorStore, VectorChunk, SearchResult } from './vectorStore.interface';
import { chunks, embeddings, eq, and, sql, desc } from '@nitiops/database';
// import { eq, and, sql, desc } from 'drizzle-orm'; // Removed direct import to avoid type mismatch if database package re-exports them

export class PgVectorStore implements VectorStore {
    private db: any;

    constructor(dbInstance: any) {
        if (!dbInstance) throw new Error('Db instance required for PgVectorStore');
        this.db = dbInstance;
    }

    async upsertChunks(vectorChunks: VectorChunk[]): Promise<void> {
        if (vectorChunks.length === 0) return;

        await this.db.transaction(async (tx: any) => {
            for (const chunk of vectorChunks) {
                // Upsert chunk metadata
                // Mapping: 
                // chunk.id -> chunks.chunk_id
                // chunk.text -> chunks.text
                // chunk.metadata -> chunks.labels (storing as generic labels for now)

                const [inserted] = await tx.insert(chunks).values({
                    chunk_id: chunk.id,
                    document_id: chunk.documentId,
                    tenant_id: chunk.tenantId,
                    chunk_index: chunk.metadata.chunk_index || 0,
                    text: chunk.text,
                    token_count: chunk.metadata.token_count || 0,
                    provenance: chunk.metadata.provenance || {},
                    labels: chunk.metadata.labels || chunk.metadata // Fallback to storing all metadata
                }).onConflictDoUpdate({
                    target: chunks.chunk_id,
                    set: {
                        text: chunk.text,
                        labels: chunk.metadata
                    }
                }).returning();

                // Upsert embedding
                await tx.insert(embeddings).values({
                    chunk_id: inserted.chunk_id,
                    embedding: chunk.vector,
                    model_name: 'stub-v1' // Todo: pass model name
                }).onConflictDoUpdate({
                    target: embeddings.chunk_id,
                    set: {
                        embedding: chunk.vector
                    }
                });
            }
        });
    }

    async search(queryVector: number[], limit: number, tenantId: string, filter?: Record<string, any>): Promise<SearchResult[]> {
        const conditions = [eq(chunks.tenant_id, tenantId)];

        if (filter) {
            Object.entries(filter).forEach(([key, value]) => {
                // Assuming simple equality checks for metadata fields
                // chunks.labels is a jsonb column
                // Drizzle: sql`${chunks.labels}->>${key} = ${value}`
                conditions.push(sql`${chunks.labels}->>${key} = ${value}`);
            });
        }

        // Use sql for L2 or Cosine distance. 
        // For cosine similarity (1 - distance), we use standard pgvector operator <=> (cosine distance).
        // similarity = 1 - (A <=> B)

        const vectorStr = JSON.stringify(queryVector);

        // We use sql operator for distance sorting
        const distanceExpr = sql<number>`embedding <=> ${vectorStr}::vector`;
        const similarityExpr = sql<number>`1 - (${distanceExpr})`;

        const results = await this.db.select({
            id: chunks.chunk_id,
            documentId: chunks.document_id,
            text: chunks.text,
            metadata: chunks.labels, // We stored metadata here
            score: similarityExpr
        })
            .from(embeddings)
            .innerJoin(chunks, eq(embeddings.chunk_id, chunks.chunk_id))
            .where(and(...conditions))
            .orderBy(distanceExpr) // Sort by distance ascending (closest first)
            .limit(limit);

        return results.map((r: any) => ({
            id: r.id,
            documentId: r.documentId,
            text: r.text,
            score: r.score,
            metadata: r.metadata as Record<string, any>
        }));
    }

    async deleteDocumentChunks(documentId: string, tenantId: string): Promise<void> {
        await this.db.delete(chunks)
            .where(and(
                eq(chunks.document_id, documentId),
                eq(chunks.tenant_id, tenantId)
            ));
    }

    async replaceChunks(documentId: string, tenantId: string, vectorChunks: VectorChunk[]): Promise<void> {
        await this.db.transaction(async (tx: any) => {
            // 1. Delete existing chunks
            await tx.delete(chunks)
                .where(and(
                    eq(chunks.document_id, documentId),
                    eq(chunks.tenant_id, tenantId)
                ));

            // 2. Insert new chunks (logic copied from upsertChunks but using tx)
            if (vectorChunks.length === 0) return;

            for (const chunk of vectorChunks) {
                const [inserted] = await tx.insert(chunks).values({
                    chunk_id: chunk.id,
                    document_id: chunk.documentId,
                    tenant_id: chunk.tenantId,
                    chunk_index: chunk.metadata.chunk_index || 0,
                    text: chunk.text,
                    token_count: chunk.metadata.token_count || 0,
                    provenance: chunk.metadata.provenance || {},
                    labels: chunk.metadata.labels || chunk.metadata
                }).returning();

                await tx.insert(embeddings).values({
                    chunk_id: inserted.chunk_id,
                    embedding: chunk.vector,
                    model_name: 'stub-v1'
                });
            }
        });
    }
}
