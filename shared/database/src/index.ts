import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Singleton pool setup
const connectionString = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/nitiops';
// Note: Each service might connect to different DB (tenant vs audit vs ingestion). 
// Typically in microservices, we might have separate pools. 
// However, the requested refactor puts "all database stuff in separate package".
// Usage pattern: import { createDb } from '@nitiops/database'; const db = createDb(url);
// OR if using shared DB (monolith style), we export default.
// Given strict governance, let's export a factory to allow services to pass their specific DB URL.

export const createDb = (connectionString: string) => {
    const pool = new Pool({ connectionString });
    return drizzle(pool, { schema });
};

// Singleton db instance for shared use
export const db = createDb(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nitiops');

// Also export schema for use
export {
    tenants,
    auditEvents,
    documents,
    documentBlobs,
    documentText,
    ingestionJobs,
    ingestionSources,
    chunks,
    embeddings,
    tools,
    toolInvocations
} from './schema';
export { eq, and, or, desc, asc, sql, gte, lte } from 'drizzle-orm';
