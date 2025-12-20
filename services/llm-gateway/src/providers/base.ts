export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    json_mode?: boolean;
}

export interface LLMResponse {
    text: string;
    model: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    raw?: any;
}

export interface LLMProvider {
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse>;
}
