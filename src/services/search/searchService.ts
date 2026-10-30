import { SearchResult, SearchFilter, SearchMode } from '@/types/search';
import { db } from '../db/database';

// Fast cosine similarity calculation for embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SearchService {
  async search(
    query: string,
    mode: SearchMode = 'hybrid',
    filter?: SearchFilter,
    queryEmbedding?: number[]
  ): Promise<SearchResult[]> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery && !queryEmbedding) return [];

    const queryTokens = trimmedQuery.split(/\s+/).filter(Boolean);
    const results: SearchResult[] = [];

    const [docs, chunks, notes] = await Promise.all([
      db.getDocuments(),
      db.getAllChunks(),
      db.getNotes(),
    ]);

    const docMap = new Map(docs.map((d) => [d.id, d]));

    // 1. Search Chunks
    if (!filter?.types || filter.types.includes('Document')) {
      for (const chunk of chunks) {
        const doc = docMap.get(chunk.documentId);
        if (!doc) continue;

        if (filter?.fileTypes && !filter.fileTypes.includes(doc.fileType)) {
          continue;
        }

        let keywordScore = 0;
        const lowerContent = chunk.content.toLowerCase();
        for (const token of queryTokens) {
          if (lowerContent.includes(token)) {
            keywordScore += 1;
          }
        }
        if (doc.title.toLowerCase().includes(trimmedQuery)) {
          keywordScore += 2;
        }

        let semanticScore = 0;
        if (queryEmbedding && chunk.embedding && chunk.embedding.length > 0) {
          semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
        }

        let finalScore = 0;
        if (mode === 'keyword') {
          finalScore = keywordScore;
        } else if (mode === 'semantic') {
          finalScore = semanticScore;
        } else {
          // Hybrid score
          finalScore = keywordScore * 0.4 + (semanticScore > 0 ? semanticScore * 0.6 : 0);
        }

        if (finalScore > 0 || (trimmedQuery && lowerContent.includes(trimmedQuery))) {
          // Extract snippet with highlight window
          const matchIndex = trimmedQuery ? lowerContent.indexOf(trimmedQuery) : -1;
          let snippet = '';
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - 60);
            const end = Math.min(chunk.content.length, matchIndex + trimmedQuery.length + 60);
            snippet = (start > 0 ? '...' : '') + chunk.content.slice(start, end) + (end < chunk.content.length ? '...' : '');
          } else {
            snippet = chunk.content.slice(0, 150) + (chunk.content.length > 150 ? '...' : '');
          }

          results.push({
            id: `res_chunk_${chunk.id}`,
            entityId: doc.id,
            title: doc.title,
            snippet,
            type: 'Document',
            fileType: doc.fileType,
            score: finalScore || 0.1,
            keywordScore,
            semanticScore: semanticScore || undefined,
            pageNumber: chunk.pageNumber,
            chunkId: chunk.id,
            documentId: doc.id,
          });
        }
      }
    }

    // 2. Search Notes
    if (!filter?.types || filter.types.includes('Note')) {
      for (const note of notes) {
        let score = 0;
        const lowerTitle = note.title.toLowerCase();
        const lowerContent = note.content.toLowerCase();

        for (const token of queryTokens) {
          if (lowerTitle.includes(token)) score += 2;
          if (lowerContent.includes(token)) score += 1;
          if (note.tags.some((t) => t.toLowerCase().includes(token))) score += 1.5;
        }

        if (score > 0) {
          results.push({
            id: `res_note_${note.id}`,
            entityId: note.id,
            title: note.title,
            snippet: note.content.slice(0, 140) + (note.content.length > 140 ? '...' : ''),
            type: 'Note',
            score,
            keywordScore: score,
          });
        }
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }
}

export const searchService = new SearchService();
