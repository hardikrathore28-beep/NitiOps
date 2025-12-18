
import axios from 'axios';
import jwt from 'jsonwebtoken';

const TENANT_SERVICE_URL = 'http://localhost:3003';
const KEYCLOAK_URL = 'http://localhost:8080';
const TENANT_REALM = 'tenant-demo';

async function verify() {
    console.log('🔍 Verifying Step 5 Requirements...');

    // 1. Login as Tenant User (alice_admin)
    console.log('1. Logging in as alice_admin (tenant-demo)...');
    let token;
    try {
        const response = await axios.post(`${KEYCLOAK_URL}/realms/${TENANT_REALM}/protocol/openid-connect/token`, new URLSearchParams({
            grant_type: 'password',
            client_id: 'tenant-console', // Public client we created in seed
            username: 'alice_admin',
            password: 'password'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        token = response.data.access_token;
        console.log('✅ Obtained ID Token');
    } catch (error: any) {
        console.error('❌ Login failed:', error.response?.data || error.message);
        process.exit(1);
    }

    // 2. Validate Token Structure locally
    const decoded: any = jwt.decode(token);
    console.log('2. Inspecting Token...');
    if (decoded.iss.endsWith(`/realms/${TENANT_REALM}`)) {
        console.log(`✅ Issuer is correct: ${decoded.iss}`);
    } else {
        console.error(`❌ Unexpected issuer: ${decoded.iss}`);
    }

    // 3. Call Backend Service (Tenant Service /whoami)
    console.log('3. Calling Restricted Backend Endpoint (/whoami)...');
    try {
        const response = await axios.get(`${TENANT_SERVICE_URL}/whoami`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Backend accepted token!');
        console.log('   Response:', response.data);

        if (response.data.tenant_id === TENANT_REALM) {
            console.log('✅ Backend derived tenant_id correctly.');
        } else {
            console.error(`❌ Backend derived wrong tenant_id: ${response.data.tenant_id}`);
        }

        if (response.data.actor.actor_id === decoded.sub) {
            console.log('✅ Actor ID matches.');
        }

    } catch (error: any) {
        console.error('❌ Backend request failed:', error.response?.data || error.message);
        // If it's 401/403, it might be policy or middleware.
        if (error.response?.status === 500) {
            console.error('   (Is Policy Service running? Is JWKS reachable?)');
        }
    }
}

verify();
