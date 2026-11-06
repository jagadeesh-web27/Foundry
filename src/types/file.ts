export type ComputerFileType =
  | 'Document'
  | 'Image'
  | 'Video'
  | 'Audio'
  | 'Spreadsheet'
  | 'Presentation'
  | 'Code'
  | 'Archive'
  | 'Other';

export interface IndexedFile {
  id: string;
  path: string;
  name: string;
  extension: string;
  mimeType?: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  accessedAt?: string;
  hash?: string;
  fileType: ComputerFileType;
  indexedAt: string;
  status: 'indexed' | 'modified' | 'unreadable';
  qualityScore?: number; // Visual / resolution score for image ranking
  isScreenRecording?: boolean;
  /** Text around the match when the file was found by its contents. */
  snippet?: string;
  /** Where the search matched: file name, folder path or file contents. */
  matchIn?: 'name' | 'folder' | 'content';
  /** Relevance of a content match, from the index; higher is more relevant. Undefined for a live disk walk. */
  relevanceScore?: number;
  /** Whether this file's text is available to quote as evidence. Undefined for a live disk walk. */
  extractionStatus?: 'ok' | 'pending' | 'unsupported_type' | 'failed';
}

export interface IndexedFolder {
  id: string;
  path: string;
  name: string;
  parentPath?: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt?: string;
  itemCount: number;
}

export interface UserDirectoryAccess {
  name: string;
  path: string;
  exists: boolean;
  fileCount?: number;
  status: 'allowed' | 'restricted' | 'scanning' | 'ready';
}