
import { Client } from 'pg';

const DATABASE_URL = 'postgres://nitiops:password@localhost:5432/nitiops';
const client = new Client({ connectionString: DATABASE_URL });

async function main() {
    await client.connect();
    try {
        console.log('🗑️ Wiping Database...');
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await client.query('GRANT ALL ON SCHEMA public TO nitiops;');
        await client.query('GRANT ALL ON SCHEMA public TO public;');
        console.log('✅ Database wiped.');
    } catch (e: any) {
        console.error('❌ Wipe failed:', e.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
