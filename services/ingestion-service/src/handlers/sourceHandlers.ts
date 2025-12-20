
import { Request, Response } from 'express';
import { db } from '../db';
import { ingestionSources, ingestionJobs, documents, documentBlobs, documentText, eq, sql } from '@nitiops/database';
import { AuditClient, GovernedRequest, Actor } from '@nitiops/governed-http';

export const createSource = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");

    const { type, name, config } = req.body;

    try {
        await AuditClient.emit({
            tenant_id,
            event_type: 'SOURCE_CREATE',
            actor,
            purpose,
            context: { type, name }
        });

        const [newSource] = await db.insert(ingestionSources).values({
            tenant_id: tenant_id!, // Non-null assertion after check
            type,
            name,
            config,
            status: 'active'
        }).returning();

        res.status(201).json(newSource);
    } catch (error: any) {
        console.error('Create source failed', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateSource = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    const { id } = req.params;
    const { config, status } = req.body;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");

    try {
        await AuditClient.emit({
            tenant_id,
            event_type: 'SOURCE_UPDATE',
            actor,
            purpose,
            context: { source_id: id }
        });

        const [updated] = await db.update(ingestionSources)
            .set({ config, status, updated_at: new Date() })
            .where(eq(ingestionSources.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Source not found' });

        res.json(updated);
    } catch (error: any) {
        console.error('Update source failed', error);
        res.status(500).json({ error: error.message });
    }
};

export const listSources = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id } = govReq;
    if (!tenant_id) throw new Error("Missing tenant context");

    try {
        const sources = await db.select().from(ingestionSources).where(eq(ingestionSources.tenant_id, tenant_id));
        res.json(sources);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncSource = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const { tenant_id, actor, purpose } = govReq;
    const { id } = req.params;
    if (!tenant_id || !actor || !purpose) throw new Error("Missing governance context");

    try {
        const [source] = await db.select().from(ingestionSources).where(eq(ingestionSources.id, id));
        if (!source) return res.status(404).json({ error: 'Source not found' });

        await AuditClient.emit({
            tenant_id,
            event_type: 'SOURCE_SYNC_REQUESTED',
            actor,
            purpose,
            context: { source_id: id, type: source.type }
        });

        const [job] = await db.insert(ingestionJobs).values({
            tenant_id,
            type: 'source_sync',
            status: 'pending',
            payload: { source_id: id }
        }).returning();

        res.status(202).json({ job_id: job.job_id, status: 'pending' });

    } catch (error: any) {
        console.error('Sync request failed', error);
        res.status(500).json({ error: error.message });
    }
};
