import axios from 'axios';
import { LLMProvider, ChatMessage, ChatOptions, LLMResponse } from './base';

export class OpenAICompatibleProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string;
    private defaultModel: string;

    constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.defaultModel = config.defaultModel || 'gpt-4';
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse> {
        const model = options?.model || this.defaultModel;
        const isJson = options?.json_mode;

        try {
            const res = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: model,
                    messages: messages,
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.max_tokens,
                    response_format: isJson ? { type: 'json_object' } : undefined
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const choice = res.data.choices[0];

            return {
                text: choice.message.content,
                model: res.data.model,
                usage: {
                    prompt_tokens: res.data.usage?.prompt_tokens || 0,
                    completion_tokens: res.data.usage?.completion_tokens || 0,
                    total_tokens: res.data.usage?.total_tokens || 0
                },
                raw: res.data
            };
        } catch (err: any) {
            console.error(`OpenAI Call Failed [${model}]:`, err.response?.data || err.message);
            throw new Error(`OpenAI Provider Error: ${err.message}`);
        }
    }
}
