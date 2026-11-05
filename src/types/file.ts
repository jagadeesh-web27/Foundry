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