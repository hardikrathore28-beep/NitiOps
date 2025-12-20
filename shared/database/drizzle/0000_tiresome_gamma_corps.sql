CREATE TABLE IF NOT EXISTS "audit_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"actor" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text,
	"hash_prev" text,
	"hash_this" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_blobs" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"blob_uri" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"size_bytes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_text" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"extracted_text" text NOT NULL,
	"extractor" varchar(50) NOT NULL,
	"confidence" real,
	"extracted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"document_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_ref" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"language" varchar(10),
	"classification" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'ingested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_jobs" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"issuer_url" varchar(512) NOT NULL,
	"display_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tenants_realm_name_unique" UNIQUE("realm_name"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_blobs" ADD CONSTRAINT "document_blobs_document_id_documents_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_text" ADD CONSTRAINT "document_text_document_id_documents_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
