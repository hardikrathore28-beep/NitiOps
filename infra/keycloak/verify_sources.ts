
// Using global fetch
// import { Client } from 'pg';

const KEYCLOAK_URL = 'http://localhost:8080';
const INGESTION_URL = 'http://localhost:3004'; // Port 3004 as per Docker
const REALM = 'tenant-demo';
const USERNAME = 'alice_admin'; // Admin role required for configuration
const PASSWORD = 'password';

async function getToken() {
    const params = new URLSearchParams();
    params.append('client_id', 'tenant-console');
    params.append('username', USERNAME);
    params.append('password', PASSWORD);
    params.append('grant_type', 'password');

    const res = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, {
        method: 'POST',
        body: params
    });

    if (!res.ok) {
        throw new Error(`Login failed: ${res.statusText}`);
    }

    const data: any = await res.json();
    return data.access_token;
}

async function verify() {
    try {
        console.log('Logging in...');
        const token = await getToken();
        console.log('✅ Logged in');

        // 1. Create Source
        console.log('1. Creating S3 Source...');
        const createRes = await fetch(`${INGESTION_URL}/sources`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Purpose': 'verification'
            },
            body: JSON.stringify({
                type: 's3',
                name: 'Financial Reports Bucket',
                config: {
                    bucket: 'nitiops-fin-reports',
                    region: 'us-east-1'
                }
            })
        });

        if (!createRes.ok) {
            console.error('Create failed', await createRes.text());
            throw new Error(`Create Source failed: ${createRes.status}`);
        }

        const source: any = await createRes.json();
        console.log('✅ Source Created:', source.id);

        // 2. List Sources
        console.log('2. Listing Sources...');
        const listRes = await fetch(`${INGESTION_URL}/sources`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Purpose': 'verification'
            }
        });

        if (!listRes.ok) throw new Error(`List Sources failed: ${listRes.status}`);
        const list: any[] = await listRes.json();
        console.log(`✅ Found ${list.length} sources`);
        const found = list.find((s: any) => s.id === source.id);
        if (!found) throw new Error('Created source not found in list');

        // 3. Trigger Sync
        console.log('3. Triggering Sync...');
        const syncRes = await fetch(`${INGESTION_URL}/sources/${source.id}/sync`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Purpose': 'verification'
            }
        });

        if (!syncRes.ok) {
            console.error('Sync failed', await syncRes.text());
            // Allow 500 if it fails fast due to config, but we expect 202 Accepted usually
            // Actually worker picks it up async. The endpoint creates a job.
            // If policy denies, we get 403.
            throw new Error(`Sync Trigger failed: ${syncRes.status}`);
        }

        const syncJob: any = await syncRes.json();
        console.log('✅ Sync Job Created:', syncJob.job_id);

        console.log('--- Verification Complete ---');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.message);
        process.exit(1);
    }
}

verify();
