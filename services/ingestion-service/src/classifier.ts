
export interface ClassificationResult {
    sensitivity: 'low' | 'medium' | 'high';
    pii_detected: boolean;
    tags: string[];
}

export class Classifier {
    classify(text: string, metadata: Record<string, any>): ClassificationResult {
        const result: ClassificationResult = {
            sensitivity: 'low',
            pii_detected: false,
            tags: []
        };

        // 1. PII Detection (Naive Regex)
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneRegex = /\+?\d[\d -]{8,}\d/g;
        const ssnRegex = /\d{3}-\d{2}-\d{4}/g; // US SSN pattern
        const aadhaarRegex = /\d{4}\s\d{4}\s\d{4}/g; // Simple 12-digit pattern

        if (emailRegex.test(text) || phoneRegex.test(text) || ssnRegex.test(text) || aadhaarRegex.test(text)) {
            result.pii_detected = true;
            result.sensitivity = 'high'; // Auto-escalate PII to high
            result.tags.push('pii');
        }

        // 2. Keyword Sensitivity
        const confidentialKeywords = ['confidential', 'secret', 'internal use only', 'private', 'proprietary'];
        if (confidentialKeywords.some(kw => text.toLowerCase().includes(kw))) {
            result.sensitivity = 'high';
            result.tags.push('confidential');
        }

        // 3. Metadata-based tagging
        if (metadata.sourceType) {
            result.tags.push(`source:${metadata.sourceType}`);
        }

        return result;
    }
}
