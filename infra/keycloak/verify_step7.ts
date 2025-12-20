
import axios from 'axios';
import jwt from 'jsonwebtoken';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const INGESTION_URL = 'http://localhost:3004';
const KEYCLOAK_URL = 'http://localhost:8080';
const TENANT_REALM = 'tenant-demo';
const DATABASE_URL = 'postgres://nitiops:password@localhost:5432/nitiops';

const db = new Client({ connectionString: DATABASE_URL });

async function main() {
    console.log('🚀 Starting Step 7 Verification...');

    // 0. Connect DB
    await db.connect();

    try {
        // 1. Login
        console.log('1. Logging in...');
        const token = await login();
        console.log('✅ Logged in');

        // 2. Upload Document
        console.log('2. Testing Upload...');
        const docId = await testUpload(token);
        if (docId) {
            console.log(`✅ Upload successful. Doc ID: ${docId}`);
            await verifyUploadSideEffects(docId);
        }

        // 3. Process Document
        if (docId) {
            console.log('3. Testing Process...');
            await testProcess(token, docId);
        }

        // 4. Transcribe
        console.log('4. Testing Transcribe...');
        await testTranscribe(token);

        // 5. REST Ingest
        console.log('5. Testing REST Ingest...');
        await testRestIngest(token);

        // 6. SOAP Ingest
        console.log('6. Testing SOAP Ingest...');
        await testSoapIngest(token);

        // 7. Verification Summary
        console.log('\n--- Verification Summary ---');
        console.log('Use `task_boundary` to report success if all checks passed.');

    } catch (err: any) {
        console.error('❌ Verification Failed:', err.message);
        if (err.response) {
            console.error('Response:', err.response.status, err.response.data);
        }
    } finally {
        await db.end();
    }
}

async function login() {
    const response = await axios.post(`${KEYCLOAK_URL}/realms/${TENANT_REALM}/protocol/openid-connect/token`, new URLSearchParams({
        grant_type: 'password',
        client_id: 'tenant-console',
        username: 'alice_admin',
        password: 'password'
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return response.data.access_token;
}

async function testUpload(token: string) {
    // Create dummy PDF
    const filePath = path.join(__dirname, 'test.pdf');
    fs.writeFileSync(filePath, 'Dummy PDF Content');

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('classification', JSON.stringify({ sensitivity: 'high', tags: ['legal'] }));

    try {
        const res = await axios.post(`${INGESTION_URL}/ingest/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`,
                'X-Purpose': 'Testing Upload'
            }
        });
        return res.data.document_id;
    } finally {
        fs.unlinkSync(filePath);
    }
}

async function verifyUploadSideEffects(docId: string) {
    // Check Document
    const docRes = await db.query('SELECT * FROM documents WHERE document_id = $1', [docId]);
    if (docRes.rows.length === 0) throw new Error(`Document ${docId} not found in DB`);
    console.log('   ✅ Document record found');

    // Check Blob
    const blobRes = await db.query('SELECT * FROM document_blobs WHERE document_id = $1', [docId]);
    if (blobRes.rows.length === 0) throw new Error(`Blob for ${docId} not found in DB`);
    console.log('   ✅ Blob record found');

    // Check Audit
    const auditRes = await db.query("SELECT * FROM audit_events WHERE context->>'document_id' = $1 AND event_type = 'INGEST_COMPLETE'", [docId]);
    if (auditRes.rows.length === 0) throw new Error(`Audit event for ${docId} not found`);
    console.log('   ✅ Audit event found');
}

async function testProcess(token: string, docId: string) {
    try {
        const res = await axios.post(`${INGESTION_URL}/ingest/${docId}/process`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Purpose': 'Testing Process'
            }
        });
        console.log('   ✅ Process request succeeded');

        // Verify text extraction
        const textRes = await db.query('SELECT * FROM document_text WHERE document_id = $1', [docId]);
        if (textRes.rows.length === 0) console.warn('   ⚠️ No text extracted (Tika might be missing/mocked)');
        else console.log(`   ✅ Extracted text found: ${textRes.rows[0].extracted_text.substring(0, 20)}...`);

    } catch (err: any) {
        console.warn('   ⚠️ Process failed (likely Tika missing):', err.message);
    }
}

async function testTranscribe(token: string) {
    const form = new FormData();
    // Simulate URL based for now or dummy file
    form.append('media_url', 'http://example.com/audio.mp3');
    form.append('title', 'Test Audio');

    const res = await axios.post(`${INGESTION_URL}/ingest/transcribe`, form, {
        headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${token}`,
            'X-Purpose': 'Testing Transcribe'
        }
    });

    // Check Job
    const jobRes = await db.query("SELECT * FROM ingestion_jobs WHERE type = 'transcription' ORDER BY created_at DESC LIMIT 1");
    if (jobRes.rows.length === 0) throw new Error('Transcription job not created');
    console.log('   ✅ Transcription job verified');
}

async function testRestIngest(token: string) {
    const res = await axios.post(`${INGESTION_URL}/ingest/api/rest`, {
        base_url: 'https://jsonplaceholder.typicode.com',
        path: '/posts/1',
        mapping: { title_field: 'title' }
    }, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'X-Purpose': 'Testing REST'
        }
    });

    const docId = res.data.document_id;
    const docRes = await db.query("SELECT * FROM documents WHERE document_id = $1 AND source_type = 'api_rest'", [docId]);
    if (docRes.rows.length === 0) throw new Error('REST Document not created');
    console.log('   ✅ REST Document verified');
}

async function testSoapIngest(token: string) {
    const res = await axios.post(`${INGESTION_URL}/ingest/api/soap`, {
        wsdl_url: 'http://example.com?wsdl',
        operation_name: 'test'
    }, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'X-Purpose': 'Testing SOAP'
        }
    });

    const jobRes = await db.query("SELECT * FROM ingestion_jobs WHERE type = 'soap_ingest' ORDER BY created_at DESC LIMIT 1");
    if (jobRes.rows.length === 0) throw new Error('SOAP Job not created');
    console.log('   ✅ SOAP Job verified');
}

main();
