import fetch from 'node-fetch';
import { AuthorizeRequest, Decision } from './types';

const POLICY_SERVICE_URL = process.env.POLICY_SERVICE_URL || 'http://policy-service:3002';

export class PolicyClient {
    static async authorize(request: AuthorizeRequest): Promise<Decision> {
        try {
            const response = await fetch(`${POLICY_SERVICE_URL}/authorize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                // Return a configured "deny" decision instead of throwing, 
                // but if 500/503 we might want to throw to let caller decide fail-closed
                throw new Error(`Policy Service error: ${response.statusText}`);
            }

            return await response.json() as Decision;
        } catch (error: any) {
            // Throwing so the caller (middleware) can handle "fail-closed" logic
            throw new Error(`Policy Service Unreachable: ${error.message}`);
        }
    }
}
