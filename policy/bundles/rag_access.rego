package policies.rag

import data.main.has_role
import data.main.is_owner_department

# Default deny
default allow = false

# ------------------------------------------------------------------------------
# RAG Access Rules (Chunk Level)
# ------------------------------------------------------------------------------

# Allow basic search entry (can search knowledge base)
allow if {
    input.action == "rag.search"
    input.resource.type == "knowledge-base"
    # has_role("user") 
    # Allow if any valid user (authenticated)
    # Or specifically admin/manager/user
    count(input.actor.roles) > 0
}

# Allow chunk read if clearance is sufficient
allow if {
    input.action == "chunk.read"
    input.resource.type == "chunk"
    has_clearance_for(input.resource.sensitivity)
}

# Allow chunk read if public
allow if {
    input.action == "chunk.read"
    input.resource.sensitivity == "public"
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
else = 4 if { has_role("tenant_admin") }  # Treat tenant_admin as admin
else = 3 if { has_role("manager") }
else = 2 if { has_role("user") }
else = 1

has_clearance_for(resource_sensitivity) if {
    user_level := user_clearance_level
    res_level := sensitivity_level[resource_sensitivity]
    user_level >= res_level
}
