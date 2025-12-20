
import { Client } from 'pg';

const DATABASE_URL = 'postgres://nitiops:password@localhost:5432/nitiops';

async function applyMigration() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
        console.log('Applying migration: Create ingestion_sources table...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS ingestion_sources (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id TEXT NOT NULL,
                type VARCHAR(50) NOT NULL,
                name TEXT NOT NULL,
                config JSONB NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        console.log('Migration applied successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
