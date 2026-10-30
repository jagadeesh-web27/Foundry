export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'error';

export type SupportedFileType = 'pdf' | 'txt' | 'markdown' | 'docx';

export interface DocumentMetadata {
  author?: string;
  keywords?: string[];
  pageCount?: number;
  wordCount?: number;
  readingTimeMinutes?: number;
  sourceUrl?: string;
  custom?: Record<string, unknown>;
}

export interface Document {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  fileType: SupportedFileType;
  fileSize: number;
  mimeType: string;
  hash: string;
  createdAt: string;
  modifiedAt: string;
  importedAt: string;
  status: DocumentStatus;
  wordCount: number;
  pageCount: number;
  chunkCount: number;
  metadata: DocumentMetadata;
}

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  embedding?: number[];
  createdAt: string;
}
