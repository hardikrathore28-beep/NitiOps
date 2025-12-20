export interface ToolInvokeContext {
    tenant_id: string;
    actor: {
        user_id: string;
        role: string;
    };
    purpose: string;
    invocation_id: string;
}

export interface ToolAdapter {
    invoke(tool: any, input: any, context: ToolInvokeContext): Promise<{ output: any }>;
}
