export interface AuthorizeRequest {
    tenant_id: string;
    actor: {
        actor_id: string;
        type: string;
        roles: string[];
        department_id: string;
        [key: string]: any;
    };
    action: string;
    resource: {
        type: string;
        id: string;
        labels?: Record<string, string>;
        owner_department_id?: string;
        jurisdiction?: string;
        sensitivity?: string;
        [key: string]: any;
    };
    purpose: string;
    context: {
        ip?: string;
        channel?: string;
        time?: string;
        justification?: string;
        case_id?: string;
        workflow_id?: string;
        agent_invocation_id?: string;
        [key: string]: any;
    };
}
