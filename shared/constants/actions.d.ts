/**
 * Actions
 *
 * Typed union of allowed actions within the platform.
 */
export type ActionType = 'rag.search' | 'agent.invoke' | 'tool.invoke' | 'workflow.start' | 'approval.request' | 'approval.decide' | 'tenant.create' | 'user.create';
export declare const ACTIONS: {
    readonly RAG_SEARCH: ActionType;
    readonly AGENT_INVOKE: ActionType;
    readonly TOOL_INVOKE: ActionType;
    readonly WORKFLOW_START: ActionType;
    readonly APPROVAL_REQUEST: ActionType;
    readonly APPROVAL_DECIDE: ActionType;
    readonly TENANT_CREATE: ActionType;
    readonly USER_CREATE: ActionType;
};
