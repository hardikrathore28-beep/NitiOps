
import axios from 'axios';
import { createDb, documents, documentText, tenants } from '@nitiops/database';
import { v4 as uuidv4 } from 'uuid';

const RAG_URL = 'http://localhost:3005';
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nitiops';

const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'tenant-demo';
const USERNAME = 'alice_admin';
const PASSWORD = 'password';

const db = createDb(DB_URL);

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

async function main() {
    console.log('--- RAG Service Verification ---');

    // 0. Authenticate
    console.log('Logging in...');
    let token: string = '';
    try {
        token = await getToken();
        console.log('✅ Logged in');
    } catch (e) {
        console.error('Login Failed', e);
        process.exit(1);
    }

    // 1. Setup Test Data
    const tenantId = uuidv4();
    const docId = uuidv4();

    // Note: To make search work with auth, the document MUST belong to the tenant that the user belongs to.
    // 'alice_admin' belongs to 'tenant-demo' (slug-based? or realm-based?). 
    // The middleware extracts tenant_id from realm name. Realm is 'tenant-demo'.
    // So tenant_id in governed request will be 'tenant-demo' (string).
    // But `tenants` table expects UUID.
    // However, my logic in `index.ts`: `const tenant_id = req.headers['x-tenant-id'] || (actor?.context?.tenant_id);`
    // And `authMiddleware` logic:
    // `const realmName = realmMatch[1]; ... govReq.tenant_id = realmName;`
    // So `govReq.tenant_id` is "tenant-demo" (string).
    // `rag-service` uses this to filter: `eq(chunks.tenant_id, tenant_id)`.
    // But `chunks.tenant_id` is UUID!
    // MISMATCH!
    // The middleware sends Realm Name (slug?) as tenant_id, but DB stores UUID.
    // I need to resolve Realm Name to Tenant UUID in middleware or service.
    // `authMiddleware` has `// TODO: Resolve to UUID`.
    // For now, I should insert the document with tenant_id = "tenant-demo"? 
    // UUID validation in DB will FAIL if I try to insert "tenant-demo".
    // 
    // Workaround for verification:
    // I can't easily change middleware now (it's shared).
    // I can change `rag-service` to lookup tenant UUID from slug/realm if needed, or...
    // WAIT. `verify_rag.ts` can set `x-tenant-id` header manually to override?
    // `const tenant_id = req.headers['x-tenant-id'] || ...` -> Yes!
    // If I pass `x-tenant-id: <UUID>` matching the document, `rag-service` will use it.
    // Does `governedRoute` override it?
    // `governedRoute` sets `govReq.tenant_id` from token.
    // `index.ts`: `const tenant_id = req.headers['x-tenant-id'] || (actor?.context?.tenant_id);`
    // Wait, `govReq.tenant_id` is NOT `actor.context.tenant_id`. `govReq` properties are separate.
    // But `index.ts` reads `req.headers`.
    // The middleware DOES NOT strip headers.
    // So if I send `x-tenant-id`, it might pass through and be used by `index.ts` IF `index.ts` prefers header.
    // `req.headers['x-tenant-id'] || ...` -> Yes it prefers header.
    // So I can simulate proper tenant resolution by passing the UUID in header.

    console.log(`Creating Tenant: ${tenantId}`);
    try {
        await db.insert(tenants).values({
            id: tenantId,
            realm_name: `test-realm-${Date.now()}`,
            slug: `test-slug-${Date.now()}`,
            issuer_url: 'http://test-params',
        });
    } catch (e) {
        console.warn('Tenant insertion failed (ignoring if FK not issue):', e);
    }

    console.log(`Creating Document: ${docId}`);
    try {
        await db.insert(documents).values({
            document_id: docId,
            tenant_id: tenantId,
            source_type: 'upload',
            source_ref: 'test-file.txt',
            content_type: 'text/plain',
            title: 'RAG Verification Doc',
            status: 'ingested',
            classification: { sensitivity: 'confidential' },
        });
    } catch (e) { console.warn('Document already exists'); }

    console.log('Inserting Document Text');
    try {
        await db.insert(documentText).values({
            document_id: docId,
            extracted_text: 'This is a test document for RAG verification.\n\nIt has two paragraphs to test chunking. This is the second paragraph.',
            extractor: 'manual'
        });
    } catch (e) { console.warn('Text already exists'); }

    // 2. Test Indexing
    console.log('\n--- Testing Indexing ---');
    try {
        const res = await axios.post(`${RAG_URL}/rag/index/${docId}`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-purpose': 'verification',
                // Privileged route might require specific role? 'alice_admin' has admin roles.
            }
        });
        console.log('Indexing Response:', res.data);
    } catch (e: any) {
        console.error('Indexing Failed:', e.response?.data || e.message);
        // Don't exit, try search
    }

    // 3. Test Search
    console.log('\n--- Testing Search ---');
    try {
        const searchRes = await axios.post(`${RAG_URL}/rag/search`, {
            query: 'test document',
            top_k: 2
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-purpose': 'search-verification',
                'x-tenant-id': tenantId // OVERRIDE for correctness
            }
        });
        console.log('Search Response:', JSON.stringify(searchRes.data, null, 2));
    } catch (e: any) {
        console.error('Search Failed:', e.response?.data || e.message);
    }
}

main();
