import {
    createDb, sql, eq, and,
    documents, documentText, ingestionJobs, ingestionSources, desc
} from '@nitiops/database';
import { FilesystemConnector } from '../connectors/filesystem';
import { S3Connector } from '../connectors/s3';
import { Normalizer } from '../normalizer';
import axios from 'axios';
import { randomUUID } from 'crypto';

const db = createDb(process.env.DATABASE_URL!);
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3005';

export const triggerIngestionJob = async (sourceId: string, tenantId: string, authToken?: string) => {
    // 1. Fetch Source Config
    const [source] = await db.select().from(ingestionSources)
        .where(and(eq(ingestionSources.id, sourceId), eq(ingestionSources.tenant_id, tenantId)));

    if (!source) throw new Error('Source not found');

    // 2. Fetch Last Job Cursor (if any)
    const [lastJob] = await db.select().from(ingestionJobs)
        .where(and(
            eq(ingestionJobs.source_id, sourceId),
            eq(ingestionJobs.status, 'completed')
        ))
        .orderBy(desc(ingestionJobs.ended_at))
        .limit(1);

    const cursor = lastJob?.cursor || {};

    // 3. Create New Job Record
    const [job] = await db.insert(ingestionJobs).values({
        tenant_id: tenantId,
        source_id: sourceId,
        type: 'sync',
        status: 'running',
        cursor: cursor, // Start with previous cursor
        payload: {},
        started_at: new Date()
    }).returning();

    // 4. Start Async Processing (Fire and Forget)
    processJob(job.job_id, source, cursor, authToken).catch(err => {
        console.error(`Job ${job.job_id} failed unhandled:`, err);
    });

    return job;
};

const processJob = async (jobId: string, source: any, cursor: any, authToken?: string) => {
    let stats = { processed: 0, added: 0, skiiped: 0, errors: 0 };
    let newCursor = { ...cursor };
    let error: string | null = null;

    try {
        console.log(`Starting ingestion job ${jobId} for source ${source.name} (${source.type})`);

        // Instantiate Connector
        let connector;
        if (source.type === 'filesystem') {
            connector = new FilesystemConnector();
        } else if (source.type === 's3') {
            connector = new S3Connector();
        } else {
            throw new Error(`Unsupported source type: ${source.type}`);
        }

        const normalizer = new Normalizer();
        const iterator = connector.fetch(source.config, cursor);

        // Iterate Raw Docs
        for await (const rawDoc of iterator) {
            stats.processed++;
            try {
                // Normalize
                const normalized = await normalizer.normalize(rawDoc);

                // Check version/dedup
                // We use document_id (deterministic UUID based on sourceUri) OR hash check
                // DB query to see if doc exists
                const [existingDoc] = await db.select().from(documents)
                    .where(eq(documents.document_id, normalized.documentId)); // Assuming normalizer produces UUID matching PK

                if (existingDoc && existingDoc.content_hash === normalized.contentHash) {
                    stats.skiiped++;
                    // Update last mtime in cursor if applies
                    // Ideally connector yields cursor updates, but we track max mtime here
                    updateCursor(newCursor, rawDoc);
                    continue;
                }

                const version = existingDoc ? (existingDoc.version || 1) + 1 : 1;

                // Transactional Upsert
                await db.transaction(async (tx) => {
                    // 1. Upsert Document
                    // Drizzle pg upsert: .onConflictDoUpdate
                    await tx.insert(documents).values({
                        document_id: normalized.documentId, // explicit ID
                        tenant_id: source.tenant_id,
                        source_id: source.id,
                        ingestion_job_id: jobId,
                        source_type: source.type,
                        source_ref: rawDoc.sourceId,
                        source_uri: rawDoc.sourceUri,
                        title: normalized.title,
                        content_type: rawDoc.contentType,
                        content_hash: normalized.contentHash,
                        version: version,
                        status: 'ingesting', // temp status
                        created_at: existingDoc ? undefined : new Date(), // Keep original creation date if exists
                        updated_at: new Date()
                    }).onConflictDoUpdate({
                        target: documents.document_id,
                        set: {
                            ingestion_job_id: jobId,
                            content_hash: normalized.contentHash,
                            version: version,
                            updated_at: new Date(),
                            status: 'ingesting'
                        }
                    });

                    // 2. Upsert Text
                    await tx.insert(documentText).values({
                        document_id: normalized.documentId,
                        extracted_text: normalized.text,
                        extractor: 'simple-v1',
                        confidence: 1.0
                    }).onConflictDoUpdate({
                        target: documentText.document_id,
                        set: {
                            extracted_text: normalized.text,
                            extracted_at: new Date()
                        }
                    });
                });

                // Trigger RAG Indexing
                await triggerRagIndex(normalized.documentId, source.tenant_id, jobId, authToken);

                // Mark doc as ingested
                await db.update(documents)
                    .set({ status: 'ingested' })
                    .where(eq(documents.document_id, normalized.documentId));

                stats.added++;
                updateCursor(newCursor, rawDoc);

            } catch (docErr: any) {
                console.error(`Error processing doc ${rawDoc.sourceUri}:`, docErr);
                stats.errors++;
            }
        }

    } catch (err: any) {
        console.error(`Job ${jobId} failed:`, err);
        error = err.message;
    } finally {
        // Update Job Status
        await db.update(ingestionJobs).set({
            status: error ? 'failed' : 'completed',
            stats: stats,
            cursor: newCursor,
            error: error,
            ended_at: new Date()
        }).where(eq(ingestionJobs.job_id, jobId));

        console.log(`Job ${jobId} finished. Stats:`, stats);
    }
};

const updateCursor = (cursor: any, doc: any) => {
    // Simple logic: track max mtime
    if (doc.metadata?.mtime) {
        const mtime = new Date(doc.metadata.mtime).getTime();
        const currentMax = cursor.lastSyncTime ? new Date(cursor.lastSyncTime).getTime() : 0;
        if (mtime > currentMax) {
            cursor.lastSyncTime = new Date(mtime).toISOString();
        }
    }
}

// Export triggerRagIndex
export const triggerRagIndex = async (docId: string, tenantId: string, jobId: string, authToken?: string) => {
    try {
        const headers: any = {
            'x-tenant-id': tenantId,
            'x-request-id': `job-${jobId}`,
            'x-purpose': 'ingestion-sync',
        };

        if (authToken) {
            headers['Authorization'] = authToken;
        }

        await axios.post(`${RAG_SERVICE_URL}/rag/index/${docId}`, {}, {
            headers
        });
    } catch (e: any) {
        console.error(`Failed to trigger RAG index for ${docId}:`, e.message);
        throw e;
    }
}

// Stub startWorker for index.ts (could be cron poller later)
export const startWorker = () => {
    console.log('Ingestion Worker Background Logic Started (Polling skipped for on-demand MVP)');
    // setInterval(checkForScheduledJobs, 60000); // Future: Scheduled syncs
};
