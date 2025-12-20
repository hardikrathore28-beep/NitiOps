export interface Citation {
    document_id: string;
    chunk_id: string;
    location: string;
    snippet: string;
}

export function cite(chunk: any): Citation {
    const prov = chunk.metadata?.provenance || chunk.provenance || {};

    let location = 'Unknown';
    if (prov.page) location = `Page ${prov.page}`;
    if (prov.section) location = location !== 'Unknown' ? `${location}, Section ${prov.section}` : `Section ${prov.section}`;
    if (location === 'Unknown' && prov.offsets) location = `Offset ${prov.offsets.start}-${prov.offsets.end}`;

    return {
        document_id: chunk.documentId || chunk.document_id,
        chunk_id: chunk.id || chunk.chunk_id,
        location: location,
        snippet: chunk.text ? chunk.text.substring(0, 50) + '...' : ''
    };
}
