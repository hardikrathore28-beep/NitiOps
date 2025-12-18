/**
 * Agent Execution Modes
 * 
 * - Sequential: Default mode. Agents execute one step at a time.
 * - Parallel: Allowed only for independent, read-only tasks (e.g., searching multiple sources).
 * - Loop: Allowed only with bounded iterations for refinement loops.
 */
export type AgentExecutionMode = 'sequential' | 'parallel' | 'loop';

export const AGENT_EXECUTION_MODES = {
    SEQUENTIAL: 'sequential' as AgentExecutionMode,
    PARALLEL: 'parallel' as AgentExecutionMode,
    LOOP: 'loop' as AgentExecutionMode
} as const;
