import * as fs from 'fs';
import * as path from 'path';

// Assume shared is at ../../../shared/prompts (based on default folder structure)
const PROMPTS_DIR = path.resolve(__dirname, '../../../shared/prompts');

export function loadPrompt(templatePath: string): { content: string, version: string } {
    try {
        const fullPath = path.join(PROMPTS_DIR, templatePath);
        const raw = fs.readFileSync(fullPath, 'utf-8');

        // Extract version from header "Prompt-Version: vX.Y.Z"
        const versionMatch = raw.match(/^Prompt-Version:\s*(.+)$/m);
        const version = versionMatch ? versionMatch[1].trim() : 'unknown';

        return { content: raw, version };
    } catch (err) {
        console.error(`Failed to load prompt ${templatePath}`, err);
        return { content: '', version: 'error' };
    }
}

export function fillTemplate(template: string, variables: Record<string, string>): string {
    let output = template;
    for (const [key, value] of Object.entries(variables)) {
        output = output.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return output;
}
