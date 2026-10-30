import { describe, it, expect } from 'vitest';
import { parseNaturalLanguageQuery, searchIndexedFiles } from '@/services/ai/intentEngine';
import { IndexedFile } from '@/types/file';

describe('Natural Language Intent Engine', () => {
  it('should parse "Give me my resume PDFs" with Document target, pdf extension, and resume keyword', () => {
    const q = parseNaturalLanguageQuery('Give me my resume PDFs');
    expect(q.targetType).toBe('Document');
    expect(q.targetExtension).toBe('pdf');
    expect(q.keywords).toContain('resume');
  });

  it('should parse date queries like "files added today" and "created yesterday"', () => {
    const q1 = parseNaturalLanguageQuery('Give me files added today');
    expect(q1.dateFilter?.type).toBe('today');

    const q2 = parseNaturalLanguageQuery('Show me files created yesterday');
    expect(q2.dateFilter?.type).toBe('yesterday');
  });

  it('should detect explicit dates e.g. "screen recordings from September 15"', () => {
    const q = parseNaturalLanguageQuery('Show screen recordings from September 15');
    expect(q.targetType).toBe('Video');
    expect(q.isScreenRecording).toBe(true);
    expect(q.dateFilter?.type).toBe('exact');
    expect(q.dateFilter?.dateString).toBe('2026-09-15');
  });

  it('should detect photo queries and quality ranking e.g. "good-looking photo of myself"', () => {
    const q = parseNaturalLanguageQuery('Give me a good-looking photo of myself');
    expect(q.targetType).toBe('Image');
    expect(q.qualityFilter).toBe(true);
  });

  it('should correctly search and rank matching computer files', () => {
    const sampleFiles: IndexedFile[] = [
      {
        id: '1',
        name: 'Jagadeesh_Resume_2026.pdf',
        path: 'C:\\Users\\User\\Downloads\\Jagadeesh_Resume_2026.pdf',
        extension: 'pdf',
        size: 200000,
        createdAt: '2026-09-18T10:00:00Z',
        modifiedAt: '2026-09-18T10:00:00Z',
        fileType: 'Document',
        indexedAt: '2026-09-21T00:00:00Z',
        status: 'indexed',
      },
      {
        id: '2',
        name: 'Offer_Letter_Senior_Engineer.pdf',
        path: 'C:\\Users\\User\\Documents\\Offer_Letter_Senior_Engineer.pdf',
        extension: 'pdf',
        size: 300000,
        createdAt: '2026-09-10T10:00:00Z',
        modifiedAt: '2026-09-10T10:00:00Z',
        fileType: 'Document',
        indexedAt: '2026-09-21T00:00:00Z',
        status: 'indexed',
      },
      {
        id: '3',
        name: 'Marriage_Ceremony_Photo.jpg',
        path: 'C:\\Users\\User\\Pictures\\Marriage_Ceremony_Photo.jpg',
        extension: 'jpg',
        size: 4000000,
        createdAt: '2025-11-20T10:00:00Z',
        modifiedAt: '2025-11-20T10:00:00Z',
        fileType: 'Image',
        indexedAt: '2026-09-21T00:00:00Z',
        status: 'indexed',
      },
    ];

    const q = parseNaturalLanguageQuery('Give me my resume PDFs');
    const result = searchIndexedFiles(sampleFiles, q);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].name).toBe('Jagadeesh_Resume_2026.pdf');
  });
});
