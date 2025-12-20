import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3007';
const TENANT_ID = 'tenant-demo';
const ACTOR_ID = 'user-123';

async function verify() {
    console.log('🚀 Starting MCP Gateway Verification...');

    try {
        // 1. Create a tool
        console.log('\n--- 1. Creating REST Tool ---');
        const createRes = await axios.post(`${GATEWAY_URL}/tools`, {
            name: 'get_weather',
            description: 'Get weather for a city',
            adapter_type: 'rest',
            sensitivity: 'low',
            allowed_purposes: ['weather_lookup', 'general_info'],
            labels: { domain: 'weather' },
            input_schema: {
                type: 'object',
                properties: {
                    city: { type: 'string' }
                },
                required: ['city']
            },
            output_schema: {
                type: 'object',
                properties: {
                    temp: { type: 'number' },
                    condition: { type: 'string' }
                }
            },
            config: {
                base_url: 'https://api.mockweather.com',
                path: '/v1/current',
                method: 'GET',
                auth_type: 'none'
            }
        }, {
            headers: {
                'x-tenant-id': TENANT_ID,
                'x-purpose': 'tool_management',
                'Authorization': `Bearer mock-token` // Need a real token for requireAuth
            }
        });

        const tool_id = createRes.data.tool_id;
        console.log(`✅ Tool created: ${tool_id}`);

        // 2. List tools
        console.log('\n--- 2. Listing Tools ---');
        const listRes = await axios.get(`${GATEWAY_URL}/tools`, {
            headers: {
                'x-tenant-id': TENANT_ID,
                'x-purpose': 'tool_management',
                'Authorization': `Bearer mock-token`
            }
        });
        console.log(`✅ Found ${listRes.data.length} tools`);

        // 3. Invoke tool (should fail with 401/403 if token not valid or policy denies, or 501 if not fully mocked)
        console.log('\n--- 3. Invoking Tool ---');
        try {
            const invokeRes = await axios.post(`${GATEWAY_URL}/tools/${tool_id}/invoke`, {
                city: 'San Francisco'
            }, {
                headers: {
                    'x-tenant-id': TENANT_ID,
                    'x-purpose': 'weather_lookup',
                    'Authorization': `Bearer mock-token`
                }
            });
            console.log('✅ Tool invoked successfully:', invokeRes.data);
        } catch (e: any) {
            console.log(`ℹ️ Tool invocation failed (expected if services not running): ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
        }

    } catch (error: any) {
        console.error('❌ Verification failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.data);
        }
    }
}

verify();
