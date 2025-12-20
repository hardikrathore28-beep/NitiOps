CREATE TABLE IF NOT EXISTS "chunks" (
	"chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"token_count" integer,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"chunk_id" uuid PRIMARY KEY NOT NULL,
	"embedding" "vector(1536)" NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"schedule" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_invocations" (
	"invocation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"actor" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"status" varchar(50) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tools" (
	"tool_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"adapter_type" varchar(50) NOT NULL,
	"sensitivity" varchar(50) NOT NULL,
	"allowed_purposes" jsonb NOT NULL,
	"labels" jsonb NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ingestion_job_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_uri" text;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "cursor" jsonb;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "stats" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "started_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "ingestion_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_ingestion_job_id_ingestion_jobs_job_id_fk" FOREIGN KEY ("ingestion_job_id") REFERENCES "ingestion_jobs"("job_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_source_id_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "ingestion_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_chunks_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("chunk_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_tool_id_tools_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "tools"("tool_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
