import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: false }); // strict: false allows generic schemas easier
addFormats(ajv);

export interface ValidationResult {
    valid: boolean;
    data?: any;
    errors?: string[];
}

export function validateJson(jsonString: string, schema: any): ValidationResult {
    try {
        // 1. Try Parse
        // Heuristic: sometimes models wrap in markdown ```json ... ```
        const cleanString = jsonString.replace(/```json\n?|\n?```/g, '').trim();
        const data = JSON.parse(cleanString);

        // 2. Validate Schema
        const validate = ajv.compile(schema);
        const valid = validate(data);

        if (!valid) {
            return {
                valid: false,
                errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`)
            };
        }

        return { valid: true, data };

    } catch (e: any) {
        return {
            valid: false,
            errors: [`JSON Parse Error: ${e.message}`]
        };
    }
}
