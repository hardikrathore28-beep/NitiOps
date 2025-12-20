
import axios from 'axios';

const KEYCLOAK_URL = 'http://localhost:8080';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';

async function check() {
    try {
        // 1. Get Master Admin Token
        const tokenRes = await axios.post(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: ADMIN_USER,
            password: ADMIN_PASS
        }));
        const token = tokenRes.data.access_token;
        console.log('✅ Admin Token obtained');

        // 2. List Realms
        const realmsRes = await axios.get(`${KEYCLOAK_URL}/admin/realms`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const realms = realmsRes.data.map((r: any) => r.realm);
        console.log('Realms found:', realms);

        if (!realms.includes('platform')) {
            console.error('❌ Platform realm is MISSING!');
            return;
        }

        // 3. Check Client
        const clientsRes = await axios.get(`${KEYCLOAK_URL}/admin/realms/platform/clients?clientId=platform-services`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (clientsRes.data.length === 0) {
            console.error('❌ platform-services client is MISSING in platform realm');
            return;
        }

        const client = clientsRes.data[0];
        console.log('✅ platform-services client found:', client.id);

        // 4. Regenerate Secret (optional, to be sure)
        // const secretRes = await axios.get(`${KEYCLOAK_URL}/admin/realms/platform/clients/${client.id}/client-secret`, {
        //     headers: { Authorization: `Bearer ${token}` }
        // });
        // console.log('Client Secret:', secretRes.data.value);

    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

check();
