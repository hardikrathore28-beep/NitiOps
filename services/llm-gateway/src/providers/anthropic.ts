import axios from 'axios';
import { LLMProvider, ChatMessage, ChatOptions, LLMResponse } from './base';

export class AnthropicProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string = 'https://api.anthropic.com/v1';
    private defaultModel: string = 'claude-3-opus-20240229';

    constructor(config: { apiKey: string }) {
        this.apiKey = config.apiKey;
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse> {
        const model = options?.model || this.defaultModel;

        // Anthropic requires 'system' to be top-level, not in messages array
        const systemMsg = messages.find(m => m.role === 'system');
        const coreMessages = messages.filter(m => m.role !== 'system');

        try {
            const res = await axios.post(
                `${this.baseUrl}/messages`,
                {
                    model: model,
                    system: systemMsg?.content,
                    messages: coreMessages,
                    max_tokens: options?.max_tokens || 1024,
                    temperature: options?.temperature || 0.7
                },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    }
                }
            );

            const content = res.data.content[0]?.text || '';

            return {
                text: content,
                model: res.data.model,
                usage: {
                    prompt_tokens: res.data.usage?.input_tokens || 0,
                    completion_tokens: res.data.usage?.output_tokens || 0,
                    total_tokens: (res.data.usage?.input_tokens || 0) + (res.data.usage?.output_tokens || 0)
                },
                raw: res.data
            };
        } catch (err: any) {
            console.error(`Anthropic Call Failed:`, err.response?.data || err.message);
            throw new Error(`Anthropic Provider Error: ${err.message}`);
        }
    }
}
