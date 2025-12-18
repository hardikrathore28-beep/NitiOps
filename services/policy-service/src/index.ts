import { createService, startService, logger } from '@nitiops/service-template';
import { Request, Response } from 'express';

const app = createService('policy-service');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

app.post('/authorize', (req: Request, res: Response) => {
    const { actor, action, resource } = req.body;
    logger.info('Authorization request', { actor, action, resource });
    // Stub: Always allow
    res.json({ allow: true });
});

startService(app, PORT);
