
import { Client } from 'pg';

const DATABASE_URL = 'postgres://nitiops:password@localhost:5432/nitiops';

async function applyMigration() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
        console.log('Applying migration: Create ingestion_sources table...');

        await client.query(`
            -- 1. Enable pgvector
            CREATE EXTENSION IF NOT EXISTS "vector";

            -- 2. Create chunks table
            CREATE TABLE IF NOT EXISTS "chunks" (
                "chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "tenant_id" uuid NOT NULL,
                "document_id" uuid NOT NULL REFERENCES "documents"("document_id") ON DELETE CASCADE,
                "chunk_index" integer NOT NULL,
                "text" text NOT NULL,
                "token_count" integer,
                "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
                "labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
                "created_at" timestamp with time zone DEFAULT now()
            );

            -- Indexes for chunks
            CREATE INDEX IF NOT EXISTS "idx_chunks_tenant_doc" ON "chunks" ("tenant_id", "document_id");
            CREATE INDEX IF NOT EXISTS "idx_chunks_labels" ON "chunks" USING GIN ("labels");

            -- 3. Create embeddings table
            CREATE TABLE IF NOT EXISTS "embeddings" (
                "chunk_id" uuid PRIMARY KEY REFERENCES "chunks"("chunk_id") ON DELETE CASCADE,
                "embedding" vector(1536) NOT NULL,
                "model_name" varchar(100) NOT NULL,
                "created_at" timestamp with time zone DEFAULT now()
            );

            -- Index for embeddings
            CREATE INDEX IF NOT EXISTS "idx_embeddings_vector" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);

        `);

        console.log('Migration applied successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
