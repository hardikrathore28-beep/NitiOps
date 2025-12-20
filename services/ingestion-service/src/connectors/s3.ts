import { Connector, RawDocument } from './base';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

interface S3Config {
    bucket: string;
    region: string;
    prefix?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string; // For MinIO/LocalStack
}

export class S3Connector implements Connector {

    private getClient(config: S3Config): S3Client {
        return new S3Client({
            region: config.region,
            credentials: (config.accessKeyId && config.secretAccessKey) ? {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            } : undefined,
            endpoint: config.endpoint,
            forcePathStyle: !!config.endpoint // Needed for MinIO usually
        });
    }

    async testConnection(config: S3Config): Promise<boolean> {
        try {
            const client = this.getClient(config);
            await client.send(new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: config.prefix,
                MaxKeys: 1
            }));
            return true;
        } catch (err) {
            console.error('S3 Connection failed:', err);
            return false;
        }
    }

    async *fetch(config: S3Config, cursor?: any): AsyncIterable<RawDocument> {
        const client = this.getClient(config);
        const lastSyncTime = cursor?.lastSyncTime ? new Date(cursor.lastSyncTime).getTime() : 0;
        let continuationToken: string | undefined;

        do {
            const listCmd = new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: config.prefix,
                ContinuationToken: continuationToken
            });

            const response = await client.send(listCmd);

            for (const obj of response.Contents || []) {
                if (!obj.Key) continue;

                // Incremental check
                const mtime = obj.LastModified ? obj.LastModified.getTime() : 0;
                if (mtime <= lastSyncTime) {
                    continue;
                }

                try {
                    const getCmd = new GetObjectCommand({
                        Bucket: config.bucket,
                        Key: obj.Key
                    });

                    const objData = await client.send(getCmd);
                    const bodyStream = objData.Body as Readable;

                    // Buffer content (careful with large files in memory - for MVP acceptable)
                    // For enterprise, we might stream directly to normalizer or disk
                    const chunks: Buffer[] = [];
                    for await (const chunk of bodyStream) {
                        chunks.push(Buffer.from(chunk));
                    }
                    const content = Buffer.concat(chunks);

                    yield {
                        sourceId: `s3://${config.bucket}`,
                        sourceUri: `s3://${config.bucket}/${obj.Key}`,
                        title: obj.Key.split('/').pop() || obj.Key,
                        content,
                        contentType: objData.ContentType || 'application/octet-stream',
                        metadata: {
                            size: obj.Size,
                            mtime: obj.LastModified,
                            etag: obj.ETag
                        },
                        hash: obj.ETag?.replace(/"/g, '') // S3 ETag is often MD5, useful for check
                    };

                } catch (err) {
                    console.error(`Error fetching S3 object ${obj.Key}:`, err);
                }
            }

            continuationToken = response.NextContinuationToken;

        } while (continuationToken);
    }
}
