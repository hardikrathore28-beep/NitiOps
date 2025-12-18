import { Pool } from 'pg';
import { logger } from '@nitiops/service-template';

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'postgres',
    database: process.env.POSTGRES_DB || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    getClient: () => pool.connect(),
};

export const initDB = async () => {
    try {
        await pool.query('SELECT NOW()');
        logger.info('Connected to Postgres');

        // Auto-migration for prototype
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                realm_name VARCHAR(255) UNIQUE NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                issuer_url VARCHAR(512) NOT NULL,
                display_name VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        logger.info('Verified schemas');

    } catch (err) {
        logger.error('Failed to connect to Postgres', { error: err });
        process.exit(1);
    }
};
