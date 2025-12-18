import axios from 'axios';
import { logger } from '@nitiops/service-template';

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3001';

export class AuditClient {
    static async logEvent(eventType: string, payload: any) {
        try {
            await axios.post(`${AUDIT_SERVICE_URL}/audit/events`, {
                tenant_id: payload.tenant_id,
                event_type: eventType,
                actor: payload.actor,
                purpose: payload.purpose,
                context: payload.context,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            logger.error('Failed to write audit log', { error: error.message });
            // Fail open or closed? For audit, we typically log the failure but don't crash
            // unless strict mode is enabled. We'll just log for now.
        }
    }
}
