
export interface Chunk {
    text: string;
    token_count: number;
    provenance: {
        offsets?: { start: number; end: number };
        section?: string;
    }
}

export const chunkText = (text: string, metadata: { maxChunkSize?: number, overlap?: number } = {}): Chunk[] => {
    // MVP Strategy: Split by blank lines (paragraphs)
    // If a paragraph > maxChunkSize, split by sentence (roughly)

    const MAX_CHUNK_SIZE = metadata.maxChunkSize || 1000;
    const OVERLAP = metadata.overlap || 100;

    const rawParagraphs = text.split(/\n\s*\n/);
    const chunks: Chunk[] = [];

    let currentOffset = 0;

    for (const para of rawParagraphs) {
        const trimmed = para.trim();
        if (!trimmed) {
            currentOffset += para.length + 1; // +1 for split char approximation (lossy)
            continue;
        }

        // Simple token estimate (chars / 4)
        const tokenCount = Math.ceil(trimmed.length / 4);

        chunks.push({
            text: trimmed,
            token_count: tokenCount,
            provenance: {
                offsets: { start: currentOffset, end: currentOffset + trimmed.length }
            }
        });

        currentOffset += para.length + 2; // Approximate \n\n length
    }

    return chunks;
};
