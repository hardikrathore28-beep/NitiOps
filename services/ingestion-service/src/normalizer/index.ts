import { RawDocument } from '../connectors/base';
import crypto from 'crypto';
import { Extractor } from './extractors/base';
import { PDFExtractor } from './extractors/pdf';
import { OCRExtractor } from './extractors/ocr';
import { Classifier } from '../classifier';

export interface NormalizedDocument {
    documentId: string; // Deterministic ID based on source+uri
    contentHash: string;
    title: string;
    text: string;
    metadata: Record<string, any>;
    version: number; // Initially 1
}

// import { Classifier } from '../classifier'; // Removed duplicate

export class Normalizer {
    private extractors: Extractor[] = [
        new PDFExtractor(),
        new OCRExtractor()
    ];
    private classifier = new Classifier();

    /**
     * Normalize a raw document into a standard structure.
     * Extracts text, generates IDs, and computes hashes.
     */
    async normalize(doc: RawDocument): Promise<NormalizedDocument> {
        // 1. Extract Text
        let text = '';

        // Find matching extractor
        const extractor = this.extractors.find(e => e.supportedMimeTypes.includes(doc.contentType));
        if (extractor) {
            text = await extractor.extract(doc.content);
        } else {
            // Fallback for text/* and json
            if (doc.contentType.startsWith('text/') || doc.contentType === 'application/json' || doc.contentType === 'application/javascript') {
                text = doc.content.toString('utf-8');
            } else {
                text = `[Unsupported Content Type: ${doc.contentType}]`;
            }
        }

        // 2. Compute Content Hash (SHA-256)
        // We use the raw content for hash to detect changes accurately
        const contentHash = crypto.createHash('sha256').update(doc.content).digest('hex');

        // 3. Generate Deterministic Document ID
        const idHash = crypto.createHash('md5').update(doc.sourceUri).digest('hex'); // MD5 is standard for UUID v3
        // Format as UUID: 8-4-4-4-12
        const documentId = [
            idHash.substring(0, 8),
            idHash.substring(8, 12),
            idHash.substring(12, 16),
            idHash.substring(16, 20),
            idHash.substring(20, 32)
        ].join('-');

        // 4. Classify
        const classification = this.classifier.classify(text, doc.metadata);

        return {
            documentId,
            contentHash,
            title: doc.title,
            text,
            metadata: { ...doc.metadata, classification },
            version: 1
        };
    }
};
