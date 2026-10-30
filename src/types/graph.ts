export type NodeType =
  | 'Document'
  | 'Note'
  | 'Concept'
  | 'Topic'
  | 'Collection'
  | 'Person'
  | 'Project'
  | 'Bookmark';

export type RelationType =
  | 'RELATED_TO'
  | 'SIMILAR_TO'
  | 'REFERENCES'
  | 'CONTAINS'
  | 'MENTIONS'
  | 'BELONGS_TO'
  | 'DERIVED_FROM';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  entityId: string;
  val?: number; // node weight / size
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: RelationType;
  weight?: number;
  reason?: string;
  similarity?: number;
  sharedConcepts?: string[];
  createdAt: string;
}

export interface ConnectionExplanation {
  sourceNode: GraphNode;
  targetNode: GraphNode;
  relationship: RelationType;
  reasons: string[];
  sharedConcepts: string[];
  semanticSimilarity?: number;
  sources: {
    id: string;
    title: string;
    type: NodeType;
  }[];
}
