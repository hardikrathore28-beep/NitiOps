package policies.rag

import data.main.has_role
import data.main.is_owner_department

# Default deny
default allow = false

# ------------------------------------------------------------------------------
# RAG Access Rules (Chunk Level)
# ------------------------------------------------------------------------------

# Allow search if user has clearance for sensitivity
allow if {
    input.action == "rag.search"
    has_clearance_for(input.resource.sensitivity)
}

# Helper: Sensitivity levels
# "public" < "internal" < "confidential" < "restricted"

sensitivity_level := {
    "public": 1,
    "internal": 2,
    "confidential": 3,
    "restricted": 4
}

# User clearance level based on roles (mock logic)
user_clearance_level = 4 if { has_role("admin") }
else = 3 if { has_role("manager") }
else = 2 if { has_role("user") }
else = 1

has_clearance_for(resource_sensitivity) if {
    user_level := user_clearance_level
    res_level := sensitivity_level[resource_sensitivity]
    user_level >= res_level
}

# Allow if resource is public
allow if {
    input.action == "rag.search"
    input.resource.sensitivity == "public"
}
