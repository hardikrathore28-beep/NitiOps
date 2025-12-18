package policies.tool

import data.main.has_role

# Default deny
default allow = false

# ------------------------------------------------------------------------------
# Tool Access Rules (MCP)
# ------------------------------------------------------------------------------

# Allow basic tools for all users
allow if {
    input.action == "tool.invoke"
    input.resource.labels.category == "utility"
    has_role("user")
}

# Allow sensitive tools only for specific roles and with justification
allow if {
    input.action == "tool.invoke"
    input.resource.labels.category == "sensitive"
    has_role("admin")
    input.context.justification != ""
}
