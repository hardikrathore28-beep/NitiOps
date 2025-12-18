# Schema Validation Tools

This directory contains tools to validate the JSON schemas and ensure examples adhere to the strict governance model.

## Prerequisites

- Node.js (v14+)
- npm

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## Running Validation

Run the validation script to check the examples against the defined schemas:

```bash
npm run validate
```

## Structure

- `examples/`: Contains valid JSON examples of Agent and Audit entities.
- `validate.ts`: TypeScript script using AJV to validate schemas.
- `package.json`: Dependencies and scripts.
