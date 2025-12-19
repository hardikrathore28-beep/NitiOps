
import axios from 'axios';

const KEYCLOAK_URL = 'http://localhost:8080';
const PLATFORM_REALM = 'platform';

async function getAdminToken() {
    try {
        const response = await axios.post(`${KEYCLOAK_URL}/realms/${PLATFORM_REALM}/protocol/openid-connect/token`, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'platform-services',
            client_secret: 'platform-services-secret'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log(response.data.access_token);
    } catch (error: any) {
        console.error('Failed to get admin token:', error.response?.data || error.message);
        process.exit(1);
    }
}

getAdminToken();
