import { Classifier } from './classifier';

const classifier = new Classifier();

describe('Classifier', () => {
    test('No PII', () => {
        const result = classifier.classify('This is a safe public document.', {});
        expect(result.pii_detected).toBe(false);
        expect(result.sensitivity).toBe('low');
    });

    test('Detects Email', () => {
        const result = classifier.classify('Contact us at support@example.com for help.', {});
        expect(result.pii_detected).toBe(true);
        expect(result.tags).toContain('pii');
    });

    test('Detects Sensitive Keyword', () => {
        const result = classifier.classify('This document is CONFIDENTIAL and internal use only.', {});
        expect(result.sensitivity).toBe('high');
        expect(result.tags).toContain('confidential');
    });
});
