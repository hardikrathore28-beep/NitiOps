curl -X POST http://localhost:3003/tenants \
  -H "Authorization: Bearer <PLATFORM_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "nasa",
    "displayName": "NASA - National Aeronautics and Space Administration",
    "description": "Exploration of the unknown"
  }'

# Expected Response:
# {
#   "id": "abc-123-uuid",
#   "realm_name": "tenant-nasa",
#   "slug": "nasa",
#   "issuer_url": "http://keycloak:8080/realms/tenant-nasa",
#   "display_name": "NASA...",
#   "created_at": "..."
# }
