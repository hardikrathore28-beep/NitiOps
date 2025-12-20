import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv();
addFormats(ajv);

export const validateSchema = (schema: any, data: any) => {
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (!valid) {
        return {
            valid: false,
            errors: validate.errors
        };
    }
    return { valid: true };
};

export const redactSensitiveData = (data: any, sensitivity: string) => {
    if (sensitivity === 'high') {
        // Simple redaction: only keep top-level keys but null values or similar
        // A better approach would be to look for specific sensitive fields or just return a hash
        return { redacted: true, original_keys: Object.keys(data) };
    }
    return data;
};
