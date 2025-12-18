package policies.tenant

import data.main.has_role

default allow = false

# Allow Platform Admins to create tenants
allow if {
    input.action == "tenant.create"
    has_role("platform_admin")
}

# Allow Tenant Admins to create users within their tenant
# (Assuming verification of tenant ownership happens in calling service or validated by token context, 
# for OPA we mostly check role and scope).
allow if {
    input.action == "user.create"
    has_role("tenant_admin")
}
