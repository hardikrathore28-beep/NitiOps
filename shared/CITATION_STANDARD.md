# Citation Standard

Every piece of information retrieved from the RAG system must be traceable back to its source document.
This standard defines the `Provenance` object structure stored with every chunk and returned in search results.

## Provenance Schema

Each chunk in the `chunks` table MUST have a `provenance` JSONB column adhering to:

```typescript
interface Provenance {
  // Rough location in the document text
  offsets?: {
    start: number;
    end: number;
  };
  // Logical location (if extractable)
  page?: number;     // e.g. for PDFs
  section?: string;  // e.g. "Section 1.2"
  slide?: number;    // e.g. for Decks
}
```

## Citation Format

When displaying results to the user, a Citation should use the `cite()` format:

```typescript
interface Citation {
  document_id: string;
  chunk_id: string;
  location: string; // Human readable string, e.g. "Page 5" or "Section B"
  snippet: string;  // First ~50 chars or relevant context
}
```

## Helper Function

```typescript
export const buildCitation = (chunk: Chunk): Citation => {
    let location = 'Unknown location';
    if (chunk.provenance.page) location = `Page ${chunk.provenance.page}`;
    else if (chunk.provenance.section) location = `${chunk.provenance.section}`;
    else if (chunk.provenance.offsets) location = `Chars ${chunk.provenance.offsets.start}-${chunk.provenance.offsets.end}`;

    return {
        document_id: chunk.document_id,
        chunk_id: chunk.chunk_id,
        location: location,
        snippet: chunk.text.substring(0, 50) + '...'
    };
};
```
