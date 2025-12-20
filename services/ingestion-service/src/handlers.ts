
import { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { documents, documentBlobs, documentText, ingestionJobs, eq, sql } from '@nitiops/database';
import { AuditClient, GovernedRequest } from '@nitiops/governed-http';
import { classifyText } from './classifier';

// Configure Multer for temp storage
const upload = multer({ dest: '/tmp/uploads/' });

export const handleUpload = async (req: Request, res: Response) => {
    // 1. Handle Multipart Upload (wrapped to ensure it runs inside governed logic if we want, or we can run it after)
    // But since governedRoute is the distinct handler, we wrap access to multer here if we want auth first.
    // However, multer needs to parse body to get metadata? 
    // If we passed metadata in headers, we could auth first.
    // If we use standard multipart, we probably want to parse it.
    // OPTION: We'll use multer inside this handler to ensure Auth runs BEFORE upload is accepted/saved.

    const uploadMiddleware = upload.single('file');

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: 'Upload failed', details: err.message });
        }

        const govReq = req as GovernedRequest;
        const { tenant_id, actor, purpose } = govReq;
        if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");
        const file = req.file;
        const body = req.body; // metadata

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const documentId = 'uuid-placeholder'; // In real app, DB generates it or we generate uuid v4
        // Logic: Insert into DB explicitly to get ID or use UUID lib. 
        // Let's use SQL RETURNING.

        try {
            await AuditClient.emit({
                tenant_id,
                event_type: 'INGEST_START',
                actor,
                purpose,
                context: { filename: file.originalname, size: file.size }
            });

            // 1. Move file to blob storage
            // Generate ID via DB insertion
            const classification = body.classification ? JSON.parse(body.classification) : {};
            const sourceRef = file.originalname;

            const [newDoc] = await db.insert(documents).values({
                tenant_id: tenant_id,
                source_type: 'upload',
                source_ref: sourceRef,
                content_type: file.mimetype,
                title: body.title || file.originalname,
                classification: classification,
                status: 'ingested'
            }).returning();

            const newDocId = newDoc.document_id;

            // 2. Save Blob
            const bloblDir = `/tmp/blobs/${tenant_id}`;
            const blobPath = path.join(bloblDir, newDocId);

            await fs.promises.mkdir(bloblDir, { recursive: true });
            await fs.promises.rename(file.path, blobPath);

            // 3. Record Blob
            await db.insert(documentBlobs).values({
                document_id: newDocId,
                blob_uri: blobPath,
                sha256: 'sha256-todo',
                size_bytes: file.size
            });

            await AuditClient.emit({
                tenant_id,
                event_type: 'INGEST_COMPLETE',
                actor,
                purpose,
                context: { document_id: newDocId }
            });

            res.status(201).json({ document_id: newDocId, status: 'ingested' });

        } catch (error: any) {
            console.error(error);
            await AuditClient.emit({
                tenant_id,
                event_type: 'INGEST_FAILED',
                actor,
                purpose,
                context: { error: error.message }
            });
            res.status(500).json({ error: 'Ingestion failed' });
        }
    });
};

export const handleProcess = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");
    const documentId = req.params.document_id;
    const tikaUrl = process.env.TIKA_URL || 'http://localhost:9998';

    try {
        // 1. Get Blob path
        const docList = await db.select({ blob_uri: documentBlobs.blob_uri })
            .from(documentBlobs)
            .where(eq(documentBlobs.document_id, documentId));

        if (docList.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const blobUri = docList[0].blob_uri;

        // 2. Update Status
        await db.update(documents)
            .set({ status: 'processing' })
            .where(eq(documents.document_id, documentId));

        // 3. Extract Text via Tika
        const fileStream = fs.createReadStream(blobUri);
        const tikaRes = await fetch(`${tikaUrl}/tika`, {
            method: 'PUT',
            body: fileStream as any, // Node fetch supports streams
            headers: { 'Accept': 'text/plain' },
            duplex: 'half'
        } as any);

        if (!tikaRes.ok) {
            throw new Error(`Tika failed: ${tikaRes.statusText}`);
        }

        let text = await tikaRes.text();
        let extractor = 'tika';
        const FILE_HAS_NO_TEXT_THRESHOLD = 50; // chars
        const isScanned = text.trim().length < FILE_HAS_NO_TEXT_THRESHOLD;

        // Conditional OCR
        if (isScanned) {
            console.log(`Document ${documentId} appears scanned. Retrying with OCR...`);
            const ocrStream = fs.createReadStream(blobUri);
            const ocrRes = await fetch(`${tikaUrl}/tika`, {
                method: 'PUT',
                body: ocrStream as any,
                headers: {
                    'Accept': 'text/plain',
                    'X-Tika-PDFextractInlineImages': 'true',
                    'X-Tika-OCRtoPlainText': 'true'
                },
                duplex: 'half'
            } as any);

            if (ocrRes.ok) {
                const ocrText = await ocrRes.text();
                // Only switch if OCR got more text
                if (ocrText.length > text.length) {
                    text = ocrText;
                    extractor = 'ocr';
                }
            } else {
                console.warn('OCR retry failed', ocrRes.statusText);
            }
        }

        // 4. Store Text
        await db.insert(documentText).values({
            document_id: documentId,
            extracted_text: text,
            extractor: extractor,
            confidence: isScanned ? 0.8 : 0.9 // using real instead of numeric literal for safety
        }).onConflictDoUpdate({
            target: documentText.document_id,
            set: { extracted_text: text, extractor: extractor }
        });

        // 5. Classification
        const classification = classifyText(text);
        await db.update(documents)
            .set({ classification: classification, status: 'ready' })
            .where(eq(documents.document_id, documentId));

        await AuditClient.emit({
            tenant_id,
            event_type: 'CLASSIFICATION_APPLIED',
            actor,
            purpose,
            context: { document_id: documentId, tags: classification.tags, sensitivity: classification.sensitivity }
        });

        await AuditClient.emit({
            tenant_id,
            event_type: 'EXTRACTION_COMPLETE',
            actor,
            purpose,
            context: { document_id: documentId, text_length: text.length, extractor }
        });

        res.json({ status: 'ready', text_length: text.length, extractor, classification });

    } catch (error: any) {
        console.error('Processing failed', error);
        await db.update(documents)
            .set({ status: 'error' })
            .where(eq(documents.document_id, documentId));

        await AuditClient.emit({
            tenant_id,
            event_type: 'EXTRACTION_FAILED',
            actor,
            purpose,
            context: { document_id: documentId, error: error.message }
        });

        res.status(500).json({ error: error.message });
    }
};

export const handleTranscribe = async (req: Request, res: Response) => {
    // Similar to upload but creates a job.
    // Supports multipart upload for MVP.
    const uploadMiddleware = upload.single('file');

    uploadMiddleware(req, res, async (err) => {
        if (err) return res.status(400).json({ error: 'Upload failed' });

        const govReq = req as GovernedRequest;
        const { tenant_id, actor, purpose } = govReq;
        if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");
        const file = req.file;
        const body = req.body;

        if (!file && !body.media_url) {
            return res.status(400).json({ error: 'File or media_url required' });
        }

        try {
            await AuditClient.emit({
                tenant_id,
                event_type: 'TRANSCRIBE_START',
                actor,
                purpose,
                context: { filename: file?.originalname || body.media_url }
            });

            // 1. Create Document
            const sourceRef = file ? file.originalname : body.media_url;
            const contentType = file ? file.mimetype : 'application/url';
            const title = body.title || sourceRef;
            const classification = body.classification ? JSON.parse(body.classification) : {};

            const [newDoc] = await db.insert(documents).values({
                tenant_id: tenant_id,
                source_type: file ? 'upload' : 'api_rest',
                source_ref: sourceRef,
                content_type: contentType,
                title: title,
                classification: classification,
                status: 'processing'
            }).returning();
            const newDocId = newDoc.document_id;

            // 2. Handle File if present
            if (file) {
                const bloblDir = `/tmp/blobs/${tenant_id}`;
                const blobPath = path.join(bloblDir, newDocId);
                await fs.promises.mkdir(bloblDir, { recursive: true });
                await fs.promises.rename(file.path, blobPath);

                await db.insert(documentBlobs).values({
                    document_id: newDocId,
                    blob_uri: blobPath,
                    sha256: 'sha256-todo',
                    size_bytes: file.size
                });
            }

            // 3. Create Job
            const [jobRes] = await db.insert(ingestionJobs).values({
                tenant_id: tenant_id,
                type: 'transcription',
                status: 'pending',
                payload: { document_id: newDocId, source: sourceRef }
            }).returning();

            res.status(202).json({
                job_id: jobRes.job_id,
                document_id: newDocId,
                status: 'pending'
            });

        } catch (error: any) {
            console.error('Transcription failed', error);
            await AuditClient.emit({
                tenant_id,
                event_type: 'TRANSCRIBE_FAILED',
                actor,
                purpose,
                context: { error: error.message }
            });
            res.status(500).json({ error: 'Transcription request failed' });
        }
    });
};
// End of file

export const handleRestIngest = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");

    const { base_url, path: apiPath, auth, params, mapping } = req.body;

    try {
        await AuditClient.emit({
            tenant_id,
            event_type: 'INGEST_API_REST_START',
            actor,
            purpose,
            context: { base_url, apiPath }
        });

        // 1. Fetch Data
        // Handle Auth (Basic implementation)
        const headers: any = { 'Accept': 'application/json' };
        if (auth && auth.type === 'bearer') headers['Authorization'] = `Bearer ${auth.token}`;
        if (auth && auth.type === 'api_key') headers[auth.key] = auth.value;

        const url = new URL(apiPath, base_url);
        if (params) Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

        const apiRes = await fetch(url.toString(), { headers });
        if (!apiRes.ok) throw new Error(`API failed: ${apiRes.statusText}`);

        const data = await apiRes.json();
        const contentStr = JSON.stringify(data);

        // 2. Create Document
        const title = mapping?.title_field ? data[mapping.title_field] : `API Import ${apiPath}`;

        const [newDoc] = await db.insert(documents).values({
            tenant_id: tenant_id,
            source_type: 'api_rest',
            source_ref: url.toString(),
            content_type: 'application/json',
            title: title,
            classification: {},
            status: 'ready'
        }).returning();

        const newDocId = newDoc.document_id;

        // 3. Store Blob (JSON content)
        const bloblDir = `/tmp/blobs/${tenant_id}`;
        const blobPath = path.join(bloblDir, newDocId);
        await fs.promises.mkdir(bloblDir, { recursive: true });
        await fs.promises.writeFile(blobPath, contentStr);

        await db.insert(documentBlobs).values({
            document_id: newDocId,
            blob_uri: blobPath,
            sha256: 'sha256-todo',
            size_bytes: contentStr.length
        });

        // 4. Store extracted text (JSON dump for now)
        await db.insert(documentText).values({
            document_id: newDocId,
            extracted_text: contentStr,
            extractor: 'api_rest',
            confidence: 1.0
        });

        await AuditClient.emit({
            tenant_id,
            event_type: 'INGEST_COMPLETE',
            actor,
            purpose,
            context: { document_id: newDocId, source: 'rest_api' }
        });

        res.status(201).json({ document_id: newDocId, status: 'ready' });

    } catch (error: any) {
        console.error('REST Ingest failed', error);
        await AuditClient.emit({
            tenant_id,
            event_type: 'INGEST_FAILED',
            actor,
            purpose,
            context: { error: error.message }
        });
        res.status(500).json({ error: error.message });
    }
};

export const handleSoapIngest = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");

    const { wsdl_url, operation_name, params } = req.body;

    try {
        await AuditClient.emit({
            tenant_id,
            event_type: 'INGEST_API_SOAP_REQUESTED',
            actor,
            purpose,
            context: { wsdl_url, operation_name }
        });

        // Create Job (Stub execution)
        const [jobRes] = await db.insert(ingestionJobs).values({
            tenant_id: tenant_id,
            type: 'soap_ingest',
            status: 'pending',
            payload: { wsdl_url, operation_name, params }
        }).returning();

        res.status(202).json({
            job_id: jobRes.job_id,
            status: 'pending',
            message: 'SOAP ingestion job queued'
        });

    } catch (error: any) {
        console.error('SOAP Ingest failed', error);
        res.status(500).json({ error: error.message });
    }
};
