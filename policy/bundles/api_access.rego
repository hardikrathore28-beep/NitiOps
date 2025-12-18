package policies.api

import data.main.has_role

# Default deny for this package
default allow = false

# Rule: Admins can access all API endpoints
allow if {
    has_role("admin")
    startswith(input.action, "api.")
}

# Rule: Users can read documents
allow if {
    input.action == "api.document.read"
    has_role("user")
     # Additional constraints could go here (e.g. valid tenant)
    input.tenant_id != ""
}

# Rule: Users can search (RAG entry point API)
allow if {
    input.action == "api.rag.search"
    has_role("user")
}

# Rule: Auditors can read audit logs
allow if {
    input.action == "api.admin.audit_logs"
    has_role("auditor")
}
