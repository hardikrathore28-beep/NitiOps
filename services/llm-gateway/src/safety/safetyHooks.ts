export class SafetyGuard {

    /**
     * Minimal prompt injection detection.
     * Heuristic-based. In real system, use a classifier model.
     */
    detectInjection(text: string): boolean {
        const suspiciousPatterns = [
            /ignore previous instructions/i,
            /system override/i,
            /delete all data/i
        ];

        return suspiciousPatterns.some(p => p.test(text));
    }

    /**
     * Redact basic PII (Email, Phone).
     * This is a post-processing hook suitable for preventing PII leaks in RAG context or output.
     */
    redactPii(text: string): string {
        // Email
        let redacted = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

        // Phone (naive)
        redacted = redacted.replace(/\+?\d[\d -]{8,}\d/g, '[PHONE_REDACTED]');

        return redacted;
    }
}
