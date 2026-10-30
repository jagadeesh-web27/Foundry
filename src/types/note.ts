export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  linkedDocumentIds: string[];
  linkedConceptIds: string[];
  createdAt: string;
  updatedAt: string;
}
