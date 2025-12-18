package policies.workflow

import data.main.has_role

# Default deny
default allow = false

# ------------------------------------------------------------------------------
# Workflow Access Rules
# ------------------------------------------------------------------------------

# Allow creating/starting workflows
allow if {
    input.action == "workflow.start"
    has_role("user")
}

# Approval inputs
allow if {
    input.action == "approval.decide"
    has_role("approver")
    # Must be the designated approver or admin
    # input.resource.owner_department_id == input.actor.department_id
}
