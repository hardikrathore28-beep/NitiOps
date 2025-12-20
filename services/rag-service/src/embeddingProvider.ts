
export interface EmbeddingProvider {
    embed(texts: string[]): Promise<number[][]>;
}

export class StubEmbeddingProvider implements EmbeddingProvider {
    // Deterministic stub: hashes input string to generate a vector[1536]
    // Obviously not semantic, but good for testing pipeline plumbing.
    async embed(texts: string[]): Promise<number[][]> {
        return texts.map(text => {
            const vector = new Array(1536).fill(0);
            // Simple seeded "hash" to fill vector
            for (let i = 0; i < 1536; i++) {
                vector[i] = (text.length * i) % 100 / 100.0;
            }
            return vector;
        });
    }
}

// In the future: OpenAIEmbeddingProvider, LocalEmbeddingProvider, etc.
export const getEmbeddingProvider = (): EmbeddingProvider => {
    // MVP: Always basic stub, or switch via env if we add OpenAI later
    return new StubEmbeddingProvider();
};
