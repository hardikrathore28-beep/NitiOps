/**
 * Agent Types
 * 
 * - Orchestrator: The root agent that manages the overall workflow and delegates to specialists.
 * - Specialist: A domain-specific agent that performs a narrowly scoped task.
 */
export type AgentType = 'orchestrator' | 'specialist';

export const AGENT_TYPES = {
    ORCHESTRATOR: 'orchestrator' as AgentType,
    SPECIALIST: 'specialist' as AgentType
} as const;
