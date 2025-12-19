import fetch from 'node-fetch';

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3001';

export interface AuditEventPayload {
    tenant_id: string;
    event_type: string;
    actor: any;
    purpose: string;
    context: any;
    timestamp?: string;
}

export class AuditClient {
    static async emit(event: AuditEventPayload): Promise<void> {
        try {
            const response = await fetch(`${AUDIT_SERVICE_URL}/audit/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...event,
                    actor: {
                        ...event.actor,
                        type: event.actor.actor_type,
                        id: event.actor.actor_id
                    },
                    timestamp: event.timestamp || new Date().toISOString()
                })
            });

            if (!response.ok) {
                console.error(`Failed to emit audit event: ${response.statusText}`);
                throw new Error(`Audit Service error: ${response.statusText}`);
            }
        } catch (error: any) {
            console.error(`Audit Service Unreachable: ${error.message}`);
            throw new Error(`Audit Service Unreachable: ${error.message}`);
        }
    }
}
