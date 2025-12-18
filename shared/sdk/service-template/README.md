# NitiOps Service Template

The standardized base for all microservices in the NitiOps platform.

## Features

- **Express.js** scaffolding with CORS and body parsing.
- **Winston** JSON logging.
- **Automatic Audit Integration**.

## Audit Behavior

All services created with `createService()` automatically participate in the platform's audit ledger.

### Automatic Events
The middleware automatically emits the following events to the `audit-service`:

1.  **`REQUEST_RECEIVED`**: Emitted immediately upon request entry.
    *   **Blocking**: If this emission fails (e.g., audit service down), the request is **rejected** with `503 Service Unavailable`. This enforces the "Audit mandatory" policy.
2.  **`REQUEST_COMPLETED`** / **`REQUEST_FAILED`**: Emitted when the response finishes (logic based on status code).
    *   Best-effort: Failure to emit specific completion log does not rollback the action (as it's already done), but is logged as an error.

### Context Propagation
The middleware expects and propagates the following headers into the audit log:

- `x-trace-id`
- `x-tenant-id`
- `x-actor-id`
- `x-workflow-id`
- `x-agent-invocation-id`

### Configuration

- **`AUDIT_SERVICE_URL`**: URL of the audit service (default: `http://audit-service:3001/audit/events`).
- **`SERVICE_NAME`**: Functioning as the "service" meta field in logs.

### Usage

```typescript
import { createService, startService } from '@nitiops/service-template';

const app = createService('my-service');
// Define routes...
startService(app, 3000);
```

### Self-Auditing
If `SERVICE_NAME` is set to `audit-service`, the automatic HTTP hooks are disabled to prevent infinite recursion. The audit service handles its own persistence directly.
