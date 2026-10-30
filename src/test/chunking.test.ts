import { describe, it, expect } from 'vitest';
import { chunkText } from '@/services/documents/documentService';

describe('Document Chunking Pipeline', () => {
  it('should return empty array for empty text', () => {
    const chunks = chunkText('');
    expect(chunks).toEqual([]);
  });

  it('should chunk text deterministically with specified chunk size and overlap', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i + 1}`).join(' ');
    const chunkSize = 20;
    const overlap = 5;

    const chunks = chunkText(words, chunkSize, overlap);
    expect(chunks.length).toBeGreaterThan(1);

    // First chunk should contain first 20 words
    const firstChunkWords = chunks[0].content.split(' ');
    expect(firstChunkWords.length).toBe(20);
    expect(firstChunkWords[0]).toBe('word1');
    expect(firstChunkWords[19]).toBe('word20');

    // Second chunk should overlap by 5 words
    const secondChunkWords = chunks[1].content.split(' ');
    expect(secondChunkWords[0]).toBe('word16');
  });

  it('should record valid start and end character offsets', () => {
    const text = 'First sentence goes here. Second sentence continues the concept. Third sentence completes it.';
    const chunks = chunkText(text, 5, 1);

    for (const chunk of chunks) {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});
