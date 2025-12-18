# Tool Invocation Authorization Specification

## Overview

The Model Context Protocol (MCP) Gateway (`mcp-gateway`) is the centralized chokepoint for all tool executions. It MUST enforce authorization before delegating execution to any tool server.

## Authorization Flow

1.  **Request**: An agent or user requests to execute a tool (e.g., `jira.create_ticket`).
2.  **Intercept**: `mcp-gateway` intercepts the request.
3.  **Authorize**: Calls `policy-service` with `action: tool.invoke`.
4.  **Enforce**:
    *   **Deny**: Return 403 Forbidden.
    *   **Allow**: Proceed to step 5.
    *   **Obligations**: If `approval_required: true`, the gateway MUST suspend execution and trigger a human-in-the-loop workflow (or deny if it cannot handle suspension).
5.  **Execute**: Forward request to the MCP server.

## Fail Closed
If `policy-service` is unreachable or returns a 500 error, `mcp-gateway` MUST **deny** the execution.

## Authorization Request Structure

```json
{
  "tenant_id": "tenant-xyz",
  "actor": {
    "actor_id": "agent-workflow-123",
    "actor_type": "agent",
    "roles": ["workflow_orchestrator"],
    "department_id": "dept-eng"
  },
  "action": "tool.invoke",
  "resource": {
    "type": "tool",
    "id": "jira-server-1:create_ticket",
    "labels": {
      "category": "sensitive", 
      "integration": "jira",
      "impact": "write"
    }
  },
  "purpose": "Resolve user issue #555",
  "context": {
    "workflow_id": "wf-abc",
    "agent_invocation_id": "inv-789",
    "param_summary": "Creating ticket for server outage" 
  }
}
```

## Obligations: Human Approval

Sensitive tools (e.g., `github.push_code`, `aws.terminate_instance`) may return an obligation requiring approval.

**Response:**
```json
{
  "allow": true,
  "obligations": {
    "approval_required": true
  }
}
```

**Gateway Responsibility:**
1.  Do NOT execute the tool immediately.
2.  Initiate an `Approval Request` (e.g., via `workflow` or internal state).
3.  Wait for the approval signal.
4.  Once approved, re-authorize (context `justification: approved`) or execute if the system design allows trusted-approval resume.

## Implementation Checklist for MCP Gateway
- [ ] Extract actor identity from incoming MCP request headers/metadata.
- [ ] Map tool name to `resource.id` and `resource.labels`.
- [ ] Implement Circuit Breaker for Policy Service (Fail Closed).
- [ ] Handle `approval_required` obligation (or return "Approval Needed" error if async not supported).
