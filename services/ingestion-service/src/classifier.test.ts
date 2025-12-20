import { classifyText } from './classifier';

describe('Classifier', () => {
    test('No PII', () => {
        const t1 = classifyText("Hello world, this is a public document.");
        expect(t1.sensitivity).toBe('low');
        expect(t1.pii_detected).toBeFalsy();
    });

    test('Email', () => {
        const t2 = classifyText("Contact me at test@example.com for info.");
        expect(t2.pii_detected).toBeTruthy();
        expect(t2.tags).toContain('pii:email');
        expect(t2.sensitivity).toBe('medium');
    });

    test('Aadhaar', () => {
        const t3 = classifyText("ID: 1234 5678 9012");
        expect(t3.pii_detected).toBeTruthy();
        expect(t3.tags).toContain('pii:aadhaar');
        expect(t3.sensitivity).toBe('high');
    });
});
