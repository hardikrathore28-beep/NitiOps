
export interface ClassificationResult {
    sensitivity: 'low' | 'medium' | 'high';
    pii_detected: boolean;
    tags: string[];
}

export const classifyText = (text: string): ClassificationResult => {
    const tags: string[] = [];
    let piiDetected = false;
    let sensitivity: 'low' | 'medium' | 'high' = 'low';

    // Patterns
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /(\+\d{1,3}[- ]?)?\d{10}/; // Simple 10-digit
    const aadhaarPattern = /\d{4}\s\d{4}\s\d{4}/; // XXXX XXXX XXXX

    if (emailPattern.test(text)) {
        tags.push('pii:email');
        piiDetected = true;
    }
    if (phonePattern.test(text)) {
        tags.push('pii:phone');
        piiDetected = true;
    }
    if (aadhaarPattern.test(text)) {
        tags.push('pii:aadhaar');
        piiDetected = true;
        sensitivity = 'high'; // Aadhaar implies high sensitivity
    }

    // Keyword based sensitivity
    const highSensitivityKeywords = ['confidential', 'secret', 'password', 'private key'];
    if (highSensitivityKeywords.some(kw => text.toLowerCase().includes(kw))) {
        sensitivity = 'high';
        tags.push('sensitivity:high-keyword');
    }

    if (piiDetected && sensitivity === 'low') {
        sensitivity = 'medium';
    }

    return { sensitivity, pii_detected: piiDetected, tags };
};
