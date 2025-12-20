import { Router } from 'express';
import { governedRoute } from '@nitiops/governed-http';
import * as handlers from './handlers';

const router = Router();

router.post('/tools', governedRoute({
    action: 'tool.create',
    resourceResolver: (req) => ({ type: 'tool', id: 'new' }),
    privileged: true,
    purposeRequired: true
}, handlers.handleCreateTool));

router.get('/tools', governedRoute({
    action: 'tool.list',
    resourceResolver: (req) => ({ type: 'tool', id: 'all' }),
    privileged: true,
    purposeRequired: true
}, handlers.handleListTools));

router.get('/tools/:tool_id', governedRoute({
    action: 'tool.read',
    resourceResolver: (req) => ({ type: 'tool', id: req.params.tool_id }),
    privileged: true,
    purposeRequired: true
}, handlers.handleGetTool));

router.post('/tools/:tool_id/invoke', governedRoute({
    action: 'tool.invoke',
    resourceResolver: (req) => ({ type: 'tool', id: req.params.tool_id }),
    privileged: true,
    purposeRequired: true
}, handlers.handleInvokeTool));

router.post('/tools/generate/openapi', governedRoute({
    action: 'tool.create',
    resourceResolver: (req) => ({ type: 'tool', id: 'generator' }),
    privileged: true,
    purposeRequired: true
}, handlers.handleGenerateFromOpenAPI));

export default router;
