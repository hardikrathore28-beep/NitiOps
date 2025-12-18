# Service Template SDK

Standardized Express service template for NitiOps microservices.
Provides logging, auditing, and authorization middleware out of the box.

## Installation
```bash
npm install @nitiops/service-template
```

## Usage

### Basic Service
```typescript
import { createService, startService, logger } from '@nitiops/service-template';

const app = createService('my-service');
const PORT = 3000;

app.get('/', (req, res) => {
    logger.info('Handling request');
    res.send('Hello World');
});

startService(app, PORT);
```

### Authorization (ABAC)

Use `createAuthorizationMiddleware` to enforce policies on routes.

```typescript
import { createService, startService, createAuthorizationMiddleware } from '@nitiops/service-template';

const app = createService('document-service');

// Define Route Mapping
const documentReadAuth = createAuthorizationMiddleware((req) => ({
    action: 'document.read',
    resource: { type: 'document', id: req.params.id },
    purpose: 'user_request'
}));

// Apply to Route
app.get('/documents/:id', documentReadAuth, (req, res) => {
    // If we are here, policy allowed it.
    // Access context via req.obligations if needed.
    res.json({ id: req.params.id, content: "Secret stuff" });
});

startService(app, 3000);
```

### Environment Variables
- `SERVICE_NAME`: Name of the service (for logging)
- `AUDIT_SERVICE_URL`: URL of the audit service (default: http://audit-service:3001)
- `POLICY_SERVICE_URL`: URL of the policy service (default: http://policy-service:3002)
