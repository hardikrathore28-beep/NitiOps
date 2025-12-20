import axios, { AxiosRequestConfig, Method } from 'axios';
import { ToolAdapter, ToolInvokeContext } from './ToolAdapter';

export class RestAdapter implements ToolAdapter {
    async invoke(tool: any, input: any, context: ToolInvokeContext): Promise<{ output: any }> {
        const { config } = tool;
        const { base_url, auth_type, headers: configuredHeaders = {} } = config;

        // Basic template substitution for path (simple implementation)
        // In a real system, we'd use a template engine or robust regex
        let url = base_url;
        const path = config.path || '';
        let processedPath = path;

        // Replace {param} in path with values from input
        const pathParams = path.match(/{([^}]+)}/g) || [];
        for (const param of pathParams) {
            const key = param.slice(1, -1);
            if (input[key] !== undefined) {
                processedPath = processedPath.replace(param, encodeURIComponent(String(input[key])));
            }
        }

        const fullUrl = new URL(processedPath, base_url).toString();

        const headers: Record<string, string> = { ...configuredHeaders };

        // Handle Auth
        if (auth_type === 'bearer') {
            // Secret would come from env or vault, but for now we look for it in env if it's a known service
            // Or assume it's passed in some way.
            // For MVP, let's assume if base_url is known, we might have a key in ENV
            // But prompt says: "no secrets in DB; use env or vault later"
            const envKey = `TOOL_AUTH_BEARER_${tool.name.toUpperCase()}`;
            const token = process.env[envKey];
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } else if (auth_type === 'apiKey') {
            const envKey = `TOOL_AUTH_APIKEY_${tool.name.toUpperCase()}`;
            const apiKey = process.env[envKey];
            const headerName = config.api_key_header || 'X-API-Key';
            if (apiKey) {
                headers[headerName] = apiKey;
            }
        }

        const method = (config.method || 'POST').toUpperCase() as Method;

        const requestConfig: AxiosRequestConfig = {
            method,
            url: fullUrl,
            headers,
            timeout: config.timeout || 10000,
        };

        if (method === 'GET' || method === 'DELETE') {
            requestConfig.params = input;
        } else {
            requestConfig.data = input;
        }

        try {
            const response = await axios(requestConfig);
            return { output: response.data };
        } catch (error: any) {
            if (error.response) {
                throw new Error(`REST Tool Failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`REST Tool Failed: ${error.message}`);
        }
    }
}
