import { Router } from 'express';
import { governedRoute } from '@nitiops/governed-http';
import * as handlers from './handlers';

const router = Router();

router.post('/chat', governedRoute({
    action: 'llm.chat',
    resourceResolver: (req) => ({ type: 'model', id: 'default' }),
    privileged: true,
    purposeRequired: true
}, handlers.handleChat));

router.post('/generate', governedRoute({
    action: 'llm.generate',
    resourceResolver: (req) => ({ type: 'model', id: 'default' }),
    privileged: true,
    purposeRequired: true
}, handlers.handleGenerate));

export default router;
