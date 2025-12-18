#!/bin/bash

POLICY_URL="http://localhost:3002"
AUDIT_URL="http://localhost:3001"
TENANT_ID="123e4567-e89b-12d3-a456-426614174000"

echo "Waiting for services..."
sleep 5

echo "--- TEST 1: Admin Access (Allow) ---"
RESPONSE=$(curl -s -X POST "$POLICY_URL/authorize" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'"$TENANT_ID"'",
    "actor": { "actor_id": "admin1", "roles": ["admin"], "department_id": "d1", "actor_type": "user" },
    "action": "api.admin.users",
    "resource": { "type": "system", "id": "users" },
    "purpose": "verification",
    "context": {}
  }')

echo "Response: $RESPONSE"
if [[ $RESPONSE == *"\"allow\":true"* ]]; then
  echo "PASS"
else
  echo "FAIL: Expected allow:true"
  exit 1
fi

echo "--- TEST 2: Guest Access (Deny) ---"
RESPONSE=$(curl -s -X POST "$POLICY_URL/authorize" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'"$TENANT_ID"'",
    "actor": { "actor_id": "guest1", "roles": ["guest"], "department_id": "d1", "actor_type": "user" },
    "action": "api.admin.users",
    "resource": { "type": "system", "id": "users" },
    "purpose": "malicious",
    "context": {}
  }')

echo "Response: $RESPONSE"
if [[ $RESPONSE == *"\"allow\":false"* ]]; then
  echo "PASS"
else
  echo "FAIL: Expected allow:false"
  exit 1
fi

echo "--- TEST 3: Audit Log Check ---"
sleep 2 # wait for async audit write
RESPONSE=$(curl -s "$AUDIT_URL/audit/events?limit=5")

# Check for AUTHZ_CHECK
if [[ $RESPONSE == *"AUTHZ_CHECK"* ]]; then
  echo "PASS: Found AUTHZ_CHECK"
else
  echo "FAIL: Missing AUTHZ_CHECK"
  exit 1
fi

# Check for AUTHZ_DECISION
if [[ $RESPONSE == *"AUTHZ_DECISION"* ]]; then
  echo "PASS: Found AUTHZ_DECISION"
else
  echo "FAIL: Missing AUTHZ_DECISION"
  exit 1
fi

echo "ALL TESTS PASSED"
