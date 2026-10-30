import { SupportedFileType } from './document';
import { NodeType } from './graph';

export type SearchMode = 'hybrid' | 'keyword' | 'semantic';

export interface SearchFilter {
  types?: NodeType[];
  fileTypes?: SupportedFileType[];
  collectionId?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  id: string;
  entityId: string;
  title: string;
  snippet: string;
  type: NodeType;
  fileType?: SupportedFileType;
  score: number;
  semanticScore?: number;
  keywordScore?: number;
  pageNumber?: number;
  chunkId?: string;
  documentId?: string;
  highlights?: string[];
}
