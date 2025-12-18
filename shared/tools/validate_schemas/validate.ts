import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";

const ajv = new Ajv({ strict: false }); // strict: false to allow $schema keyword in newer drafts if not fully supported or to avoid strict warnings
addFormats(ajv);

const SCHEMAS_DIR = path.join(__dirname, "../../schemas");
const EXAMPLES_DIR = path.join(__dirname, "examples");

// Load all schemas
const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith(".json"));

for (const file of schemaFiles) {
    const schemaContent = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, file), "utf-8"));
    try {
        ajv.addSchema(schemaContent);
        console.log(`Loaded schema: ${file}`);
    } catch (e) {
        console.error(`Error loading schema ${file}:`, e);
        process.exit(1);
    }
}

// Validate Agent Invocation Example
const agentExamplePath = path.join(EXAMPLES_DIR, "agent_invocation_example.json");
const agentExample = JSON.parse(fs.readFileSync(agentExamplePath, "utf-8"));
const agentSchemaId = "https://nitiops.com/schemas/agent_invocation";

const validateAgent = ajv.getSchema(agentSchemaId);
if (!validateAgent) {
    console.error("Agent Invocation schema not found!");
    process.exit(1);
}

if (validateAgent(agentExample)) {
    console.log("✅ Agent Invocation Example is VALID");
} else {
    console.error("❌ Agent Invocation Example is INVALID");
    console.error(validateAgent.errors);
    process.exit(1);
}

// Validate Audit Event Example
const auditExamplePath = path.join(EXAMPLES_DIR, "audit_event_agent_example.json");
const auditExample = JSON.parse(fs.readFileSync(auditExamplePath, "utf-8"));
const auditSchemaId = "https://nitiops.com/schemas/audit_event";

const validateAudit = ajv.getSchema(auditSchemaId);
if (!validateAudit) {
    console.error("Audit Event schema not found!");
    process.exit(1);
}

if (validateAudit(auditExample)) {
    console.log("✅ Audit Event Example is VALID");
} else {
    console.error("❌ Audit Event Example is INVALID");
    console.error(validateAudit.errors);
    process.exit(1);
}

console.log("All validations passed.");
