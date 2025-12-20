
import { Client } from 'pg';

const DATABASE_URL = 'postgres://nitiops:password@localhost:5432/nitiops';
const client = new Client({ connectionString: DATABASE_URL });

async function main() {
    await client.connect();
    try {
        console.log('Creating tables...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS documents (
                document_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                tenant_id text NOT NULL,
                source_type varchar(50) NOT NULL,
                source_ref text NOT NULL,
                content_type varchar(100) NOT NULL,
                title text NOT NULL,
                language varchar(10),
                classification jsonb DEFAULT '{}',
                version integer DEFAULT 1,
                status varchar(50) DEFAULT 'ingested' NOT NULL,
                created_at timestamp with time zone DEFAULT now(),
                updated_at timestamp with time zone DEFAULT now()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS document_blobs (
                document_id uuid PRIMARY KEY REFERENCES documents(document_id) ON DELETE CASCADE,
                blob_uri text NOT NULL,
                sha256 varchar(64) NOT NULL,
                size_bytes integer NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS document_text (
                document_id uuid PRIMARY KEY REFERENCES documents(document_id) ON DELETE CASCADE,
                extracted_text text NOT NULL,
                extractor varchar(50) NOT NULL,
                confidence real,
                extracted_at timestamp with time zone DEFAULT now()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ingestion_jobs (
                job_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                tenant_id text NOT NULL,
                type varchar(50) NOT NULL,
                status varchar(50) DEFAULT 'pending' NOT NULL,
                payload jsonb NOT NULL,
                result jsonb,
                created_at timestamp with time zone DEFAULT now(),
                updated_at timestamp with time zone DEFAULT now()
            );
        `);

        // Also ensure audit_events exists though it probably does
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_events (
                event_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                tenant_id text NOT NULL,
                timestamp timestamp with time zone DEFAULT now() NOT NULL,
                event_type text NOT NULL,
                actor jsonb NOT NULL,
                purpose text NOT NULL,
                context jsonb DEFAULT '{}'::jsonb NOT NULL,
                "references" jsonb DEFAULT '{}'::jsonb NOT NULL,
                payload_hash text,
                hash_prev text,
                hash_this text
            );
        `);

        console.log('✅ Tables created or verified.');
    } catch (e: any) {
        console.error('Error creating tables:', e);
    } finally {
        await client.end();
    }
}

main();
