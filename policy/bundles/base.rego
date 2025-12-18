package main

# ------------------------------------------------------------------------------
# Base Policy: Default Deny & Aggregation
# ------------------------------------------------------------------------------

# Default deny
default allow = false

# Allow verification endpoint
allow if {
    input.action == "auth.inspect"
}

# Unify allow decisions from sub-policies
allow if {
    data.policies.api.allow
}

allow if {
    data.policies.rag.allow
}

allow if {
    data.policies.tool.allow
}

allow if {
    data.policies.agent.allow
}

allow if {
    data.policies.workflow.allow
}

allow if {
    data.policies.tenant.allow
}

# ------------------------------------------------------------------------------
# Response Definitions (Canonical AuthorizeResponse)
# ------------------------------------------------------------------------------

decision_id := uuid.rfc4122("")

# Collect all reasons from sub-policies (if any explain why allowed/denied)
# For now, we mainly return allow. If denied, reasons might be populated by debug.

reasons = []  # Placeholder for future reason logic

# obligations defaults
obligations = {
    "redactions": [],
    "approval_required": false,
    "max_rows": 1000,
    "field_mask": []
}

policy_version = "1.0.0"

response = {
    "allow": allow,
    "decision_id": decision_id,
    "reasons": reasons,
    "obligations": obligations,
    "policy_version": policy_version
}

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

# Helper: Check if actor has a specific role
has_role(role) if {
    some r in input.actor.roles
    r == role
}

# Helper: Check if actor belongs to owner department
is_owner_department if {
    input.actor.department_id == input.resource.owner_department_id
}

# Helper: Check jurisdiction match
is_same_jurisdiction if {
    input.actor.jurisdiction == input.resource.jurisdiction
}
