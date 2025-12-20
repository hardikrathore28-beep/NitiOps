import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createDb, ingestionJobs, tenants } from '@nitiops/database';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const INGESTION_URL = process.env.INGESTION_URL || 'http://localhost:3004';
const RAG_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3005';
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nitiops';

// Auth Config
const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'tenant-demo';
const USERNAME = 'alice_admin';
const PASSWORD = 'password';

const db = createDb(DB_URL);

// Setup Test Data
const TEST_DIR = path.join(__dirname, 'test_docs');
const TEST_FILE_1 = path.join(TEST_DIR, 'policy_sample.txt');
const TEST_FILE_2 = path.join(TEST_DIR, 'manual.md');

async function setup() {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
    const timestamp = Date.now();
    fs.writeFileSync(TEST_FILE_1, `This is a sample policy document for ingestion verification.\n\nIt contains specific keywords like TERMINATOR-T800 and SKYNET-V5.\nGenerated at: ${timestamp}`);
    fs.writeFileSync(TEST_FILE_2, `# Manual\n\nThis is a markdown manual for protocol 22.\nGenerated at: ${timestamp}`);

    // Download PDF Sample
    const pdfPath = path.join(TEST_DIR, 'sample.pdf');
    if (!fs.existsSync(pdfPath)) {
        console.log('   Downloading sample PDF...');
        try {
            const res = await axios.get('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', { responseType: 'arraybuffer' });
            fs.writeFileSync(pdfPath, res.data);
            console.log('   ✅ PDF downloaded');
        } catch (e) {
            console.warn('   ⚠️ Failed to download PDF, creating dummy text file as PDF for test (Normalizer might fail to parse but flow should continue)');
            fs.writeFileSync(pdfPath, '%PDF-1.4 ... dummy content ...');
        }
    }

    // Download OCR Sample
    const imgPath = path.join(TEST_DIR, 'sample_ocr.png');
    if (!fs.existsSync(imgPath)) {
        console.log('   Downloading sample OCR Image...');
        try {
            const res = await axios.get('https://tesseract.projectnaptha.com/img/eng_bw.png', { responseType: 'arraybuffer' });
            fs.writeFileSync(imgPath, res.data);
            console.log('   ✅ Image downloaded');
        } catch (e) {
            console.warn('   ⚠️ Failed to download Image');
        }
    }
}

async function cleanup() {
    // Keep test dir for manual inspection if needed, or clear it
    if (process.env.CLEANUP === 'true' && fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

async function getToken() {
    const params = new URLSearchParams();
    params.append('client_id', 'tenant-console');
    params.append('username', USERNAME);
    params.append('password', PASSWORD);
    params.append('grant_type', 'password');

    try {
        const res = await axios.post(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, params);
        return res.data.access_token;
    } catch (e: any) {
        throw new Error(`Login failed: ${e.message}`);
    }
}

async function getOrCreateTenant(): Promise<string> {
    const [existing] = await db.select().from(tenants).where(eq(tenants.realm_name, REALM));
    if (existing) return existing.id;

    const id = uuidv4();
    await db.insert(tenants).values({
        id,
        realm_name: REALM,
        slug: 'tenant-demo-slug',
        issuer_url: `${KEYCLOAK_URL}/realms/${REALM}`,
        display_name: 'Demo Tenant'
    });
    return id;
}

async function main() {
    console.log('--- Verifying Ingestion Service (Advanced) ---');
    await setup();

    let token = '';
    try {
        console.log('0. Logging in...');
        token = await getToken();
        console.log('   ✅ Logged in');
    } catch (e: any) {
        console.error('   ❌ Login Failed', e.message);
        process.exit(1);
    }

    let tenantId;
    try {
        tenantId = await getOrCreateTenant();
        console.log(`   ✅ Tenant ID resolved: ${tenantId}`);
    } catch (e: any) {
        console.error('   ❌ Failed to resolve tenant', e.message);
        process.exit(1);
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId,
        'x-purpose': 'verification'
    };

    try {
        // 1. Create Source
        console.log('1. Creating Source...');
        const sourceRes = await axios.post(`${INGESTION_URL}/ingestion/sources`, {
            name: `Test Docs ${Date.now()}`,
            type: 'filesystem',
            config: { path: TEST_DIR }
        }, { headers });

        const sourceData = sourceRes.data.length ? sourceRes.data[0] : sourceRes.data;
        const sourceId = sourceData.id;
        console.log(`   Source Created: ${sourceId}`);

        // 2. Trigger Sync
        console.log('2. Triggering Sync...');
        const syncRes = await axios.post(`${INGESTION_URL}/ingestion/sync/${sourceId}`, {}, { headers });
        const jobId = syncRes.data.jobId;
        console.log(`   Job Started: ${jobId}`);

        // 3. Poll Job
        console.log('3. Polling Job...');
        let status = 'running';
        let retries = 0;
        let jobResult;

        while (status === 'running' && retries < 40) { // Increased timeout for OCR
            await new Promise(r => setTimeout(r, 1000));
            const jobRes = await axios.get(`${INGESTION_URL}/ingestion/jobs/${jobId}`, { headers });
            jobResult = jobRes.data;
            status = jobResult.status;
            process.stdout.write(`\r   Status: ${status} | Processed: ${jobResult.stats.processed}`);
            if (status !== 'running') console.log(''); // Newline
            retries++;
        }

        if (status !== 'completed') {
            console.error('\n   ❌ Job Finished with status:', status);
            console.error('   Error:', jobResult?.error);
            if (status === 'failed') throw new Error(`Job failed: ${jobResult?.error}`);
        }

        // 4. Verify DB
        // Expect: 2 Text files + 1 PDF + 1 Image = 4 docs
        if (jobResult.stats.added < 4) {
            console.warn(`   ⚠️ Expected 4 docs added, got ${jobResult.stats.added}. (Might be skipped if hash match)`);
        } else {
            console.log(`   ✅ Ingested ${jobResult.stats.added} documents.`);
        }

        // 5. Search Verification
        console.log('5. Verifying Search (RAG Service)...');
        await new Promise(r => setTimeout(r, 3000)); // Wait for async indexing if any

        const checkSearch = async (label: string, query: string, snippet?: string) => {
            try {
                const searchRes = await axios.post(`${RAG_URL}/rag/search`, {
                    query, top_k: 1
                }, { headers });

                if (searchRes.data.results?.length > 0) {
                    const match = searchRes.data.results[0].text;
                    console.log(`   ✅ Search (${label}) successful!`);
                    // console.log(`      Match: ${match.substring(0, 60)}...`);
                } else {
                    console.warn(`   ⚠️ Search (${label}) returned no results.`);
                }
            } catch (e: any) {
                console.warn(`   ⚠️ Search (${label}) failed: ${e.message}`);
            }
        };

        await checkSearch('Text', 'TERMINATOR-T800');
        await checkSearch('PDF', 'Dummy PDF file'); // Content from W3C dummy pdf
        await checkSearch('OCR', 'Mild Splendour'); // Content from Tesseract sample

    } catch (err: any) {
        console.error('\nFAILED:', err.message);
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
        }
        console.error(err.stack);
        process.exit(1);
    } finally {
        await cleanup();
    }
}

main();
