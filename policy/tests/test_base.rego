package tests.main

import data.main

# ------------------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------------------

test_default_deny if {
    not main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["guest"]},
        "action": "unknown",
        "resource": {},
        "purpose": "none",
        "context": {}
    }
}

test_api_admin_access if {
    main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["admin"]},
        "action": "api.admin.users",
        "resource": {},
        "purpose": "audit",
        "context": {}
    }
}

test_api_user_access if {
    main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["user"]},
        "action": "api.document.read",
        "resource": {},
        "purpose": "read",
        "context": {}
    }
}

test_rag_search_access_public if {
    main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["user"]},
        "action": "rag.search",
        "resource": {"type": "chunk", "sensitivity": "public"},
        "purpose": "search",
        "context": {}
    }
}

test_rag_search_access_restricted_fail if {
    not main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["user"]},
        "action": "rag.search",
        "resource": {"type": "chunk", "sensitivity": "restricted"},
        "purpose": "search",
        "context": {}
    }
}

test_tool_access_utility if {
    main.allow with input as {
        "tenant_id": "t1",
        "actor": {"roles": ["user"]},
        "action": "tool.invoke",
        "resource": {"labels": {"category": "utility"}},
        "purpose": "help",
        "context": {}
    }
}
