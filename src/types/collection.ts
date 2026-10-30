export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt: string;
  collectionId?: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  color?: string;
  documentIds: string[];
  noteIds: string[];
  bookmarkIds: string[];
  conceptIds: string[];
  createdAt: string;
  updatedAt: string;
}
