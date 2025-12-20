import { Request } from 'express';

export interface Actor {
    actor_id: string;
    type: 'user' | 'service' | 'agent';
    roles: string[];
    department_id?: string;
}

export interface Resource {
    type: string;
    id: string;
    labels?: Record<string, string>;
    owner_department_id?: string;
    jurisdiction?: string;
    sensitivity?: string;
}

export interface Context {
    time: string;
    [key: string]: any;
}

export interface AuthorizeRequest {
    tenant_id: string;
    actor: Actor;
    action: string;
    resource: Resource;
    purpose: string;
    context: Context;
}

export interface Decision {
    allow: boolean;
    decision_id: string;
    reasons?: string[];
    obligations?: Record<string, any>;
}

export interface GovernedRequest extends Request {
    actor?: Actor;
    tenant_id?: string;
    purpose?: string;
    obligations?: Record<string, any>;
    audit_context?: {
        trace_id: string;
        request_id: string;
    };
}

export interface RouteConfig {
    action: string;
    resourceResolver: (req: Request) => Resource;
    privileged?: boolean; // If true, fail closed
    purposeRequired?: boolean; // Default true
    redactRequestBody?: boolean; // Default true for privileged
    policyFailOpen?: boolean; // Default false (Deny). If true, allow when policy unavailable (only if !privileged).
}
