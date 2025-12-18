import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';

const ajv = new Ajv();
addFormats(ajv);

const requestSchemaPath = path.resolve(__dirname, '../../../shared/schemas/AuthorizeRequest.json');
const responseSchemaPath = path.resolve(__dirname, '../../../shared/schemas/AuthorizeResponse.json');

const requestSchema = JSON.parse(fs.readFileSync(requestSchemaPath, 'utf-8'));
// const responseSchema = JSON.parse(fs.readFileSync(responseSchemaPath, 'utf-8')); // Maybe useful later for response validation

export const validateRequest = ajv.compile(requestSchema);
