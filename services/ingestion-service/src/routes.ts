import { Router } from 'express';
import { governedRoute } from '@nitiops/governed-http';
import * as handlers from './handlers/ingestionHandler';

const router = Router();

// Sources
router.post('/ingestion/sources', governedRoute({
    action: 'ingestion.source.create',
    resourceResolver: (req) => ({ type: 'ingestion-source', id: 'new' }),
    privileged: true
}, handlers.createSource));

router.get('/ingestion/sources', governedRoute({
    action: 'ingestion.source.list',
    resourceResolver: (req) => ({ type: 'ingestion-source', id: 'list' })
}, handlers.listSources));

// Sync
router.post('/ingestion/sync/:sourceId', governedRoute({
    action: 'ingestion.sync',
    resourceResolver: (req) => ({ type: 'ingestion-source', id: req.params.sourceId }),
    privileged: true
}, handlers.triggerSync));

// Jobs
router.get('/ingestion/jobs/:jobId', governedRoute({
    action: 'ingestion.job.read',
    resourceResolver: (req) => ({ type: 'ingestion-job', id: req.params.jobId })
}, handlers.getJob));

import multer from 'multer';
const upload = multer({ dest: '/tmp/uploads/' });

// ... Sources ...

// Direct Ingestion
router.post('/ingest/upload',
    upload.single('file'),
    governedRoute({
        action: 'document.ingest',
        resourceResolver: (req) => ({ type: 'document', id: 'new' }),
        privileged: true,
        purposeRequired: true
    }, handlers.uploadDocument)
);

router.post('/ingest/:document_id/process', governedRoute({
    action: 'document.process',
    resourceResolver: (req) => ({ type: 'document', id: req.params.document_id }),
    privileged: true
}, handlers.processDocument));

router.post('/ingest/api/rest', governedRoute({
    action: 'document.ingest_api_rest',
    resourceResolver: (req) => ({ type: 'api-source', id: req.body.base_url }),
    privileged: true
}, handlers.ingestRest));

router.post('/ingest/api/soap', governedRoute({
    action: 'document.ingest_api_soap',
    resourceResolver: (req) => ({ type: 'api-source', id: req.body.wsdl_url }),
    privileged: true
}, handlers.ingestSoap));

router.post('/ingest/transcribe', governedRoute({
    action: 'document.transcribe',
    resourceResolver: (req) => ({ type: 'media', id: 'new' }),
    privileged: true
}, handlers.transcribeMedia));

export default router;
