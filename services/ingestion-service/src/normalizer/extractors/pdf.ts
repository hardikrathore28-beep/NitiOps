import { Extractor } from './base';
const pdf = require('pdf-parse');

export class PDFExtractor implements Extractor {
    supportedMimeTypes = ['application/pdf'];

    async extract(buffer: Buffer): Promise<string> {
        try {
            const data = await pdf(buffer);
            // We can also extract metadata: data.info, data.metadata
            // For now, return text.
            return data.text;
        } catch (error: any) {
            console.warn('PDF Extraction failed:', error.message);
            return ''; // Fail soft or throw?
        }
    }
}
