import { describe, it, expect } from 'vitest';
import { resolveReference, isFollowUpReference } from '@/services/agent/referenceResolver';
import { IndexedFile } from '@/types/file';

function file(name: string): IndexedFile {
  return {
    id: name,
    path: `C:\\Docs\\${name}`,
    name,
    extension: name.split('.').pop() || '',
    size: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    fileType: 'Document',
    indexedAt: '2026-01-01T00:00:00.000Z',
    status: 'indexed',
  };
}

const twoFiles = [file('Budget.pdf'), file('Forecast.pdf')];
const oneFile = [file('Resume.pdf')];

describe('referenceResolver: isFollowUpReference', () => {
  it.each([
    'summarize the second one',
    'open that file',
    'compare it with the other PDF',
    'what did it say about salary?',
    'open the first one',
    'read number 2',
    'tell me about another one',
  ])('"%s" is recognized as a follow-up reference', (input) => {
    expect(isFollowUpReference(input)).toBe(true);
  });

  it.each(['find my resume', 'what is my battery level', 'which one the largest file', 'show me the one from yesterday'])(
    '"%s" is not a follow-up reference',
    (input) => {
      expect(isFollowUpReference(input)).toBe(false);
    },
  );
});

describe('referenceResolver: resolveReference', () => {
  it('a non-reference query is passed through untouched', () => {
    expect(resolveReference('find my resume', { lastFiles: twoFiles }).kind).toBe('not_a_reference');
  });

  it('a reference with no prior context is reported honestly, not guessed', () => {
    expect(resolveReference('summarize the second one', undefined).kind).toBe('no_context');
    expect(resolveReference('open that file', { lastFiles: [] }).kind).toBe('no_context');
  });

  it('resolves an ordinal reference against the last result set', () => {
    const r = resolveReference('summarize the second one', { lastFiles: twoFiles });
    expect(r).toMatchObject({ kind: 'resolved', files: [twoFiles[1]] });
  });

  it('resolves "the first one" and "the last one"', () => {
    expect(resolveReference('open the first one', { lastFiles: twoFiles })).toMatchObject({ kind: 'resolved', files: [twoFiles[0]] });
    expect(resolveReference('open the last one', { lastFiles: twoFiles })).toMatchObject({ kind: 'resolved', files: [twoFiles[1]] });
  });

  it('resolves a numbered reference ("number 2")', () => {
    const r = resolveReference('read number 2', { lastFiles: twoFiles });
    expect(r).toMatchObject({ kind: 'resolved', files: [twoFiles[1]] });
  });

  it('an out-of-range ordinal is reported as ambiguous, not silently clamped', () => {
    const r = resolveReference('summarize the fifth one', { lastFiles: twoFiles });
    expect(r.kind).toBe('ambiguous');
  });

  it('a pronoun resolves unambiguously when only one file was in play', () => {
    expect(resolveReference('open that file', { lastFiles: oneFile })).toMatchObject({ kind: 'resolved', files: oneFile });
    expect(resolveReference('what did it say about salary?', { lastFiles: oneFile })).toMatchObject({ kind: 'resolved', files: oneFile });
  });

  it('a pronoun is ambiguous when several files were in play', () => {
    expect(resolveReference('what did it say about salary?', { lastFiles: twoFiles }).kind).toBe('ambiguous');
  });

  it('"the other PDF" resolves to everything but the first file', () => {
    const r = resolveReference('compare it with the other PDF', { lastFiles: twoFiles });
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') expect(r.files).toEqual([twoFiles[1]]);
  });

  it('"the other one" with only one prior file has nothing else to point to', () => {
    expect(resolveReference('show me the other one', { lastFiles: oneFile }).kind).toBe('no_context');
  });
});
