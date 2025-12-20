import { Connector, RawDocument } from './base';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface FilesystemConfig {
    path: string;
    patterns?: string[]; // e.g. ["*.pdf", "*.txt"]
}

export class FilesystemConnector implements Connector {

    async testConnection(config: FilesystemConfig): Promise<boolean> {
        try {
            await fs.access(config.path);
            return true;
        } catch {
            return false;
        }
    }

    async *fetch(config: FilesystemConfig, cursor?: any): AsyncIterable<RawDocument> {
        const rootPath = config.path;
        const lastSyncTime = cursor?.lastSyncTime ? new Date(cursor.lastSyncTime).getTime() : 0;
        let newMaxTime = lastSyncTime;

        // Recursive walker
        async function* walk(dir: string): AsyncIterable<string> {
            try {
                const dirents = await fs.readdir(dir, { withFileTypes: true });
                for (const dirent of dirents) {
                    const res = path.resolve(dir, dirent.name);

                    // Simple ignore list
                    if (dirent.name === 'node_modules' || dirent.name === '.git' || dirent.name.startsWith('.')) {
                        continue;
                    }

                    if (dirent.isDirectory()) {
                        yield* walk(res);
                    } else {
                        yield res;
                    }
                }
            } catch (err) {
                console.error(`Error walking directory ${dir}:`, err);
            }
        }

        for await (const filePath of walk(rootPath)) {
            try {
                const stats = await fs.stat(filePath);

                // Incremental check: Skip if not modified since last sync
                // Note: In real world, we might want to process deletes too. 
                // This simple iterator only finds added/modified files.
                // Deletions require a full scan comparison or watcher. 
                // For MVP incremental sync, we just process new/modified.
                if (stats.mtimeMs <= lastSyncTime) {
                    continue;
                }

                if (stats.mtimeMs > newMaxTime) {
                    newMaxTime = stats.mtimeMs;
                }

                const content = await fs.readFile(filePath);

                // Determine content type (simple map)
                const ext = path.extname(filePath).toLowerCase();
                let contentType = 'application/octet-stream';
                if (ext === '.txt') contentType = 'text/plain';
                else if (ext === '.md') contentType = 'text/markdown';
                else if (ext === '.html') contentType = 'text/html';
                else if (ext === '.pdf') contentType = 'application/pdf';
                else if (ext === '.json') contentType = 'application/json';

                // Calculate hash for dedup
                const hash = crypto.createHash('sha256').update(content).digest('hex');

                yield {
                    sourceId: config.path, // Identifying the root
                    sourceUri: `file://${filePath}`,
                    title: path.basename(filePath),
                    content,
                    contentType,
                    metadata: {
                        size: stats.size,
                        mtime: stats.mtime,
                        path: filePath
                    },
                    hash
                };

            } catch (err) {
                console.error(`Error reading file ${filePath}:`, err);
            }
        }

        // Yield new cursor at the end (not really yielded by iterator, handled by caller?)
        // The interface defines AsyncIterator<RawDocument>, not response with cursor.
        // Wait, I defined `fetch` to return `AsyncIterable<RawDocument>`.
        // How do I return the new cursor? 
        // 1. Return it as a special object?
        // 2. ConnectorResponse type?
        // My interface was `fetch(config, cursor): AsyncIterable<RawDocument>`. 
        // I should stick to that directly yielding documents. 
        // The caller can track the max mtime seen in the yielded docs to update cursor.
        // Or I can change interface to return `Promise<ConnectorResponse>`.
        // Streaming via generator is better for memory.
        // I will add `cursor` to RawDocument metadata? No, that's per doc.
        // Let's rely on the caller to compute max mtime from yielded docs for FS.

        // Actually, let's update `base.ts` to allow returning cursor or state updates?
        // AsyncGenerator can return a value! `return cursor`.
        // But `for await` loops discard the return value.
        // I will assume the caller calculates the cursor based on the max `mtime` it sees in the docs, 
        // OR the connector attaches `connectorState` to the last doc? 

        // For simplicity: properties of the stream?
        // Let's modify `metadata` to include `cursorValue`?
    }
}
