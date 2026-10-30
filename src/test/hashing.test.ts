import { describe, it, expect } from 'vitest';
import { computeHash } from '@/services/documents/documentService';

describe('Document Hashing & Deduplication', () => {
  it('should generate identical SHA-256 hash for identical content', async () => {
    const text = 'Deterministic text content for Foundry knowledge base.';
    const hash1 = await computeHash(text);
    const hash2 = await computeHash(text);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string is 64 chars
  });

  it('should generate different hashes for distinct content', async () => {
    const hashA = await computeHash('Document A content');
    const hashB = await computeHash('Document B content');

    expect(hashA).not.toBe(hashB);
  });
});
