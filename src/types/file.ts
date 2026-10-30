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