/**
 * Actions
 * 
 * Typed union of allowed actions within the platform.
 */
export type ActionType =
    | 'rag.search'
    | 'agent.invoke'
    | 'tool.invoke'
    | 'workflow.start'
    | 'approval.request'
    | 'approval.decide';

export const ACTIONS = {
    RAG_SEARCH: 'rag.search' as ActionType,
    AGENT_INVOKE: 'agent.invoke' as ActionType,
    TOOL_INVOKE: 'tool.invoke' as ActionType,
    WORKFLOW_START: 'workflow.start' as ActionType,
    APPROVAL_REQUEST: 'approval.request' as ActionType,
    APPROVAL_DECIDE: 'approval.decide' as ActionType
} as const;
