import { Document, Chunk, SupportedFileType, DocumentStatus } from '@/types/document';
import { db } from '../db/database';
import { GraphNode } from '@/types/graph';

// Simple fast SHA-256 hash using Web Crypto API
export async function computeHash(content: string | ArrayBuffer): Promise<string> {
  const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic chunker with configurable size & overlap
export function chunkText(
  text: string,
  chunkSize: number = 512,
  overlap: number = 64
): { content: string; startOffset: number; endOffset: number; tokenCount: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: { content: string; startOffset: number; endOffset: number; tokenCount: number }[] = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const chunkWords = words.slice(startIndex, startIndex + chunkSize);
    const chunkContent = chunkWords.join(' ');
    
    // Approximate start and end character offsets
    const startOffset = text.indexOf(chunkWords[0], startIndex > 0 ? chunks[chunks.length - 1]?.startOffset : 0);
    const endOffset = startOffset >= 0 ? startOffset + chunkContent.length : 0;
    
    // Approximate token count (1 token ≈ 0.75 words)
    const tokenCount = Math.round(chunkWords.length * 1.33);

    chunks.push({
      content: chunkContent,
      startOffset: Math.max(0, startOffset),
      endOffset: Math.max(0, endOffset),
      tokenCount,
    });

    if (startIndex + chunkSize >= words.length) {
      break;
    }
    startIndex += Math.max(1, chunkSize - overlap);
  }

  return chunks;
}

export class DocumentService {
  async getAll(): Promise<Document[]> {
    return db.getDocuments();
  }

  async getById(id: string): Promise<Document | null> {
    return db.getDocumentById(id);
  }

  async getChunks(documentId: string): Promise<Chunk[]> {
    return db.getChunksByDocumentId(documentId);
  }

  async importTextDocument(params: {
    title: string;
    fileName: string;
    filePath: string;
    fileType: SupportedFileType;
    content: string;
    fileSize: number;
    mimeType?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }): Promise<{ document: Document; duplicate: boolean }> {
    const hash = await computeHash(params.content);

    // Duplicate check
    const existing = await db.getDocumentByHash(hash);
    if (existing) {
      return { document: existing, duplicate: true };
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const wordCount = params.content.trim().split(/\s+/).filter(Boolean).length;
    const estimatedPages = Math.max(1, Math.ceil(wordCount / 400));

    const document: Document = {
      id: docId,
      title: params.title,
      fileName: params.fileName,
      filePath: params.filePath,
      fileType: params.fileType,
      fileSize: params.fileSize,
      mimeType: params.mimeType || 'text/plain',
      hash,
      createdAt: now,
      modifiedAt: now,
      importedAt: now,
      status: 'indexed' as DocumentStatus,
      wordCount,
      pageCount: estimatedPages,
      chunkCount: 0,
      metadata: {
        wordCount,
        pageCount: estimatedPages,
        readingTimeMinutes: Math.ceil(wordCount / 200),
      },
    };

    // Chunking
    const rawChunks = chunkText(
      params.content,
      params.chunkSize || 512,
      params.chunkOverlap || 64
    );

    const chunks: Chunk[] = rawChunks.map((rc, idx) => ({
      id: `chunk_${docId}_${idx}`,
      documentId: docId,
      content: rc.content,
      chunkIndex: idx,
      pageNumber: Math.min(estimatedPages, Math.floor((idx / (rawChunks.length || 1)) * estimatedPages) + 1),
      startOffset: rc.startOffset,
      endOffset: rc.endOffset,
      tokenCount: rc.tokenCount,
      createdAt: now,
    }));

    document.chunkCount = chunks.length;

    // Save to database
    await db.saveDocument(document);
    await db.saveChunks(chunks);

    // Register node in Knowledge Graph
    const graphNode: GraphNode = {
      id: `doc_${docId}`,
      label: document.title,
      type: 'Document',
      entityId: docId,
      val: Math.min(5, 1 + Math.log10(wordCount + 1)),
      metadata: {
        fileType: document.fileType,
        wordCount,
      },
    };
    await db.saveGraphNode(graphNode);

    return { document, duplicate: false };
  }

  async delete(id: string): Promise<void> {
    await db.deleteDocument(id);
  }
}

export const documentService = new DocumentService();
