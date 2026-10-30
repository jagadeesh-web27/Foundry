import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '@/services/search/searchService';

describe('Vector Semantic Similarity Calculation', () => {
  it('should return 1.0 for identical non-zero vectors', () => {
    const vec = [0.2, 0.5, 0.8, -0.1];
    const similarity = cosineSimilarity(vec, vec);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    const similarity = cosineSimilarity(vecA, vecB);
    expect(similarity).toBe(0.0);
  });

  it('should return -1.0 for opposite vectors', () => {
    const vecA = [1, 2, 3];
    const vecB = [-1, -2, -3];
    const similarity = cosineSimilarity(vecA, vecB);
    expect(similarity).toBeCloseTo(-1.0, 5);
  });

  it('should handle zero vectors safely without division by zero', () => {
    const vecA = [0, 0, 0];
    const vecB = [1, 2, 3];
    const similarity = cosineSimilarity(vecA, vecB);
    expect(similarity).toBe(0.0);
  });
});
