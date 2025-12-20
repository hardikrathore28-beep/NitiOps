import { LLMProvider } from './base';
import { MockLLMProvider } from './mock';
import { OpenAICompatibleProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';

export function getLLMProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER || 'mock';

    switch (provider) {
        case 'mock':
            return new MockLLMProvider();
        case 'openai':
            return new OpenAICompatibleProvider({
                apiKey: process.env.OPENAI_API_KEY!,
                baseUrl: process.env.OPENAI_BASE_URL, // Optional, defaults to OpenAI
                defaultModel: process.env.LLM_MODEL_NAME || 'gpt-4'
            });
        case 'local': // Local DeepSeek via Ollama/vLLM
            return new OpenAICompatibleProvider({
                apiKey: 'ollama', // Often ignored by Ollama
                baseUrl: process.env.LOCAL_LLM_URL || 'http://host.docker.internal:11434/v1',
                defaultModel: process.env.LLM_MODEL_NAME || 'deepseek-coder'
            });
        case 'anthropic':
            return new AnthropicProvider({
                apiKey: process.env.ANTHROPIC_API_KEY!
            });
        case 'gemini':
            return new GeminiProvider({
                apiKey: process.env.GEMINI_API_KEY!
            });
        default:
            console.warn(`Unknown LLM_PROVIDER '${provider}', defaulting to mock.`);
            return new MockLLMProvider();
    }
}
