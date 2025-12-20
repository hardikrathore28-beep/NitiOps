import { Extractor } from './base';
import { createWorker } from 'tesseract.js';

export class OCRExtractor implements Extractor {
    supportedMimeTypes = ['image/png', 'image/jpeg', 'image/tiff', 'image/bmp', 'image/webp'];

    async extract(buffer: Buffer): Promise<string> {
        try {
            const worker = await createWorker('eng');
            const ret = await worker.recognize(buffer);
            await worker.terminate();
            return ret.data.text;
        } catch (error: any) {
            console.warn('OCR Extraction failed:', error.message);
            return '';
        }
    }
}
