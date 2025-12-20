
import { Request, Response } from 'express';
import { createDb, ingestionSources, ingestionJobs, documents, documentText, documentBlobs, eq, and } from '@nitiops/database';
import { triggerIngestionJob } from '../worker/ingestionWorker';

const db = createDb(process.env.DATABASE_URL!);

// --- Existing Source Handlers ---

export const createSource = async (req: Request, res: Response) => {
    try {
        const { name, type, config, schedule } = req.body;
        const tenant_id = req.headers['x-tenant-id'] as string;

        if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });

        const [source] = await db.insert(ingestionSources).values({
            tenant_id,
            name,
            type,
            config,
            schedule
        }).returning();

        res.json(source);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const listSources = async (req: Request, res: Response) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] as string;
        if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });

        const sources = await db.select().from(ingestionSources).where(eq(ingestionSources.tenant_id, tenant_id));
        res.json(sources);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const triggerSync = async (req: Request, res: Response) => {
    try {
        const { sourceId } = req.params;
        const tenant_id = req.headers['x-tenant-id'] as string;
        const authToken = req.headers['authorization'];

        const job = await triggerIngestionJob(sourceId, tenant_id, authToken);

        res.json({ status: 'started', jobId: job.job_id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getJob = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const [job] = await db.select().from(ingestionJobs).where(eq(ingestionJobs.job_id, jobId));

        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json(job);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};


// --- New Ingestion Handlers (Step 7) ---

export const uploadDocument = async (req: Request, res: Response) => {
    try {
        const file = (req as any).file; // Multer adds this
        const tenant_id = req.headers['x-tenant-id'] as string;
        if (!file || !tenant_id) return res.status(400).json({ error: 'File and Tenant ID required' });

        const blobUri = `file:///tmp/blobs/${tenant_id}/${file.originalname}`;

        // 1. Create Document
        const [doc] = await db.insert(documents).values({
            tenant_id,
            source_type: 'upload',
            source_ref: file.originalname,
            content_type: file.mimetype,
            title: file.originalname,
            status: 'ingested',
            version: 1,
            classification: {}
        }).returning();

        // 2. Create Blob stub
        await db.insert(documentBlobs).values({
            document_id: doc.document_id,
            blob_uri: blobUri,
            sha256: 'stub-hash',
            size_bytes: file.size
        });

        res.json({ document_id: doc.document_id, status: 'uploaded' });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const processDocument = async (req: Request, res: Response) => {
    try {
        const { document_id } = req.params;

        const [job] = await db.insert(ingestionJobs).values({
            tenant_id: req.headers['x-tenant-id'] as string || 'unknown',
            type: 'process_document',
            payload: { document_id },
            status: 'pending'
        }).returning();

        res.json({ jobId: job.job_id, status: 'processing_started' });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const ingestRest = async (req: Request, res: Response) => {
    try {
        const { base_url, path, mapping } = req.body;
        const tenant_id = req.headers['x-tenant-id'] as string;

        // Stubbed Fetch
        const mockResponse = { title: "API Data", content: "Some content from REST API" };

        const [doc] = await db.insert(documents).values({
            tenant_id,
            source_type: 'api_rest',
            source_ref: `${base_url}${path}`,
            content_type: 'application/json',
            title: mockResponse.title,
            status: 'ingested',
            classification: {}
        }).returning();

        // Save text directly
        await db.insert(documentText).values({
            document_id: doc.document_id,
            extracted_text: mockResponse.content,
            extractor: 'api_adapter',
            confidence: 1.0
        });

        res.json({ document_id: doc.document_id, status: 'ingested' });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const ingestSoap = async (req: Request, res: Response) => {
    try {
        const { wsdl_url } = req.body;
        const tenant_id = req.headers['x-tenant-id'] as string;

        const [job] = await db.insert(ingestionJobs).values({
            tenant_id,
            type: 'soap_ingest',
            payload: req.body,
            status: 'pending'
        }).returning();

        res.json({ jobId: job.job_id, status: 'pending' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const transcribeMedia = async (req: Request, res: Response) => {
    try {
        const { media_url } = req.body;
        const tenant_id = req.headers['x-tenant-id'] as string;

        const [job] = await db.insert(ingestionJobs).values({
            tenant_id,
            type: 'transcribe',
            payload: { media_url },
            status: 'pending'
        }).returning();

        res.json({ jobId: job.job_id, status: 'transcription_queued' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
