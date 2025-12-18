package policies.agent

import data.main.has_role

# Default deny
default allow = false

# ------------------------------------------------------------------------------
# Agent Access Rules (AgentTool)
# ------------------------------------------------------------------------------

# Allow root orchestrator to invoke specialist agents
allow if {
    input.action == "agent.invoke"
    # The actor in this case might be the Workflow Agent
    input.actor.actor_type == "agent"
    input.actor.roles[_] == "workflow_orchestrator"
}

# Allow users to invoke the root workflow agent
allow if {
    input.action == "agent.invoke"
    input.resource.type == "agent"
    input.resource.id == "workflow_agent_root"
    has_role("user")
}
