import { createDb } from '@nitiops/database';

export const db = createDb(process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://postgres:postgres@postgres:5432/nitiops');
