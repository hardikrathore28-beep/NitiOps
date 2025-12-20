import fetch from 'node-fetch';

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3001';

export interface AuditEventPayload {
    tenant_id: string;
    event_type: string;
    actor: {
        actor_id: string;
        type: string;
        roles?: string[];
        department_id?: string;
    };
    purpose: string;
    context: any;
    references?: {
        workflow_id?: string;
        agent_invocation_id?: string;
    };
    timestamp?: string;
}

export class AuditClient {
    static async emit(event: AuditEventPayload): Promise<void> {
        try {
            const body = {
                ...event,
                actor: {
                    ...event.actor,
                    id: event.actor.actor_id,      // Override with schema expected 'id'
                    type: event.actor.type         // Ensure type is present
                },
                timestamp: event.timestamp || new Date().toISOString()
            };

            const response = await fetch(`${AUDIT_SERVICE_URL}/audit/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                console.error(`Failed to emit audit event: ${response.statusText}`);
                throw new Error(`Audit Service error: ${response.statusText}`);
            }
        } catch (error: any) {
            console.error(`Audit Service Unreachable: ${error.message}`);
            // Fail closed logic is handled by the caller (middleware) if privileged=true
            throw new Error(`Audit Service Unreachable: ${error.message}`);
        }
    }
}
