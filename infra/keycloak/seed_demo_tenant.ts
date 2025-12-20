
import axios from 'axios';

const TENANT_SERVICE_URL = 'http://localhost:3003';
const KEYCLOAK_URL = 'http://localhost:8080';
const PLATFORM_REALM = 'platform';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getAdminToken() {
    try {
        const response = await axios.post(`${KEYCLOAK_URL}/realms/${PLATFORM_REALM}/protocol/openid-connect/token`, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'platform-services',
            client_secret: 'platform-services-secret'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error: any) {
        console.error('Failed to get admin token:', error.response?.data || error.message);
        process.exit(1);
    }
}

async function seed() {
    console.log('🌱 Seeding Demo Tenant...');

    // 1. Get Token
    const token = await getAdminToken();
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Create Tenant
    try {
        console.log('Provisioning tenant-demo...');
        await axios.post(`${TENANT_SERVICE_URL}/tenants`, {
            slug: 'demo',
            displayName: 'Demo Corp',
            description: 'A demo tenant for testing'
        }, { headers: { ...authHeaders, 'X-Purpose': 'Infrastructure Initialization' } });
        console.log('✅ Tenant created: tenant-demo');
    } catch (error: any) {
        if (error.response?.status === 409 || error.response?.data?.details?.includes('already exists')) {
            console.log('⚠️ Tenant already exists, skipping creation.');
        } else {
            console.error('❌ Failed to create tenant:', error.response?.data || error.message);
            // Proceeding might fail if tenant doesn't exist
        }
    }

    // 3. Create Users
    const users = [
        { username: 'alice_admin', email: 'alice@demo.com', firstName: 'Alice', lastName: 'Admin', roles: ['tenant_admin'] },
        { username: 'bob_officer', email: 'bob@demo.com', firstName: 'Bob', lastName: 'Officer', roles: ['officer'] },
        { username: 'charlie_supervisor', email: 'charlie@demo.com', firstName: 'Charlie', lastName: 'Supervisor', roles: ['supervisor'] },
        { username: 'dave_auditor', email: 'dave@demo.com', firstName: 'Dave', lastName: 'Auditor', roles: ['auditor'] }
    ];

    for (const user of users) {
        try {
            console.log(`Creating user ${user.username}...`);
            await axios.post(`${TENANT_SERVICE_URL}/tenants/demo/users`, user, { headers: { ...authHeaders, 'X-Purpose': 'User Onboarding' } });
            console.log(`✅ User created: ${user.username}`);
        } catch (error: any) {
            if (error.response?.status === 409) {
                console.log(`⚠️ User ${user.username} already exists.`);
            } else {
                console.error(`❌ Failed to create user ${user.username}:`, error.response?.data || error.message);
            }
        }
    }

    console.log('\n✨ Seeding Complete!');
    console.log('-----------------------------------');
    console.log('Login URL: http://localhost:8080/realms/tenant-demo/account');
    console.log('Credentials (Temporary): password');
    console.log('Users:', users.map(u => u.username).join(', '));
}

seed();
