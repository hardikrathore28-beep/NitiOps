
import { Router } from 'express';
import { governedRoute } from '@nitiops/governed-http';
import { handleUpload, handleProcess, handleTranscribe, handleRestIngest, handleSoapIngest } from './handlers';

const router = Router();

// 1. Upload
router.post('/ingest/upload', governedRoute(
    {
        action: 'document.ingest',
        privileged: true, // Requires strict audit/policy
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'new',
            type: 'document',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    handleUpload
));

// 2. Process
router.post('/ingest/:document_id/process', governedRoute(
    {
        action: 'document.process',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: req.params.document_id,
            type: 'document',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    handleProcess
));

// 3. Transcribe
router.post('/ingest/transcribe', governedRoute(
    {
        action: 'document.ingest_transcription',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'new-transcription',
            type: 'document',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    handleTranscribe
));

// 4. REST Ingest
router.post('/ingest/api/rest', governedRoute(
    {
        action: 'document.ingest_api_rest',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'new-rest-ingest',
            type: 'document',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    handleRestIngest
));

// 5. SOAP Ingest
router.post('/ingest/api/soap', governedRoute(
    {
        action: 'document.ingest_api_soap',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'new-soap-job',
            type: 'document',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    handleSoapIngest
));

// 6. Ingestion Sources
import { createSource, updateSource, listSources, syncSource } from './handlers/sourceHandlers';

router.post('/sources', governedRoute(
    {
        action: 'ingestion.configure',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'new-source',
            type: 'ingestion_source',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    createSource
));

router.put('/sources/:id', governedRoute(
    {
        action: 'ingestion.configure',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: req.params.id,
            type: 'ingestion_source',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    updateSource
));

router.get('/sources', governedRoute(
    {
        action: 'ingestion.list_sources',
        privileged: false,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: 'list',
            type: 'ingestion_source',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    listSources
));

router.post('/sources/:id/sync', governedRoute(
    {
        action: 'ingestion.sync_source',
        privileged: true,
        purposeRequired: true,
        resourceResolver: (req) => ({
            id: req.params.id,
            type: 'ingestion_source',
            tenant_id: (req as any).tenant_id || 'unknown'
        })
    },
    syncSource
));

export default router;
