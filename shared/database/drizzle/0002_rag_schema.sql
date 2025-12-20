-- Migration: RAG Schema (pgvector, chunks, embeddings)

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
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL, -- { page, section, offsets }
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL, -- { sensitivity, department_id, jurisdiction, source_type }
	"created_at" timestamp with time zone DEFAULT now()
);

-- Indexes for chunks
CREATE INDEX IF NOT EXISTS "idx_chunks_tenant_doc" ON "chunks" ("tenant_id", "document_id");
CREATE INDEX IF NOT EXISTS "idx_chunks_labels" ON "chunks" USING GIN ("labels");

-- 3. Create embeddings table
-- We assume 1536 dimensions for now (OpenAI text-embedding-ada-002 / text-embedding-3-small)
-- Using vector(1536)
CREATE TABLE IF NOT EXISTS "embeddings" (
	"chunk_id" uuid PRIMARY KEY REFERENCES "chunks"("chunk_id") ON DELETE CASCADE,
	"embedding" vector(1536) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

-- Index for embeddings
-- starting with hnsw for performance, defaulting to 'vector_l2_ops' (Euclidean distance) or 'vector_cosine_ops'
-- Cosine distance is usually preferred for text embeddings. 
-- Note: 'vector_cosine_ops' requires creating index WITH (m = 16, ef_construction = 64) usually.
-- We'll use a standard HNSW index.
CREATE INDEX IF NOT EXISTS "idx_embeddings_vector" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
