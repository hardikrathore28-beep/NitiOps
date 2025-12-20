export interface Extractor {
    supportedMimeTypes: string[];
    extract(buffer: Buffer): Promise<string>;
}
