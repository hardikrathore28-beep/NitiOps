/**
 * Event Types
 * 
 * Comprehensive list of audit events for agents, tools, and workflows.
 */
export type EventType =
    | 'AGENT_INVOKE_START'
    | 'AGENT_INVOKE_END'
    | 'TOOL_INVOKE_START'
    | 'TOOL_INVOKE_END'
    | 'WORKFLOW_START'
    | 'WORKFLOW_END'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_DECIDED';

export const EVENT_TYPES = {
    AGENT_INVOKE_START: 'AGENT_INVOKE_START' as EventType,
    AGENT_INVOKE_END: 'AGENT_INVOKE_END' as EventType,
    TOOL_INVOKE_START: 'TOOL_INVOKE_START' as EventType,
    TOOL_INVOKE_END: 'TOOL_INVOKE_END' as EventType,
    WORKFLOW_START: 'WORKFLOW_START' as EventType,
    WORKFLOW_END: 'WORKFLOW_END' as EventType,
    APPROVAL_REQUESTED: 'APPROVAL_REQUESTED' as EventType,
    APPROVAL_DECIDED: 'APPROVAL_DECIDED' as EventType
} as const;
