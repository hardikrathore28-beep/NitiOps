import { LLMProvider, ChatMessage, ChatOptions, LLMResponse } from './base';

export class MockLLMProvider implements LLMProvider {
    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse> {
        const lastMsg = messages[messages.length - 1].content;

        let responseText = "Mock response to: " + lastMsg.substring(0, 50);

        // If JSON mode is requested, return valid JSON
        if (options?.json_mode) {
            responseText = JSON.stringify({
                output: {
                    mock_value: "test",
                    original_query: lastMsg.substring(0, 20)
                }
            });
        }

        return {
            text: responseText,
            model: 'mock-model-v1',
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15
            }
        };
    }
}
