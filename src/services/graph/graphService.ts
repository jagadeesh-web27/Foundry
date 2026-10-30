import { GraphNode, GraphEdge, ConnectionExplanation, NodeType, RelationType } from '@/types/graph';
import { db } from '../db/database';

export class GraphService {
  async getGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return db.getGraphData();
  }

  async addNode(node: GraphNode): Promise<void> {
    await db.saveGraphNode(node);
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    await db.saveGraphEdge(edge);
  }

  async removeNode(id: string): Promise<void> {
    await db.deleteGraphNode(id);
  }

  // "Why Are These Connected?" feature grounded in actual data
  async explainConnection(nodeIdA: string, nodeIdB: string): Promise<ConnectionExplanation | null> {
    const { nodes, edges } = await db.getGraphData();
    const nodeA = nodes.find((n) => n.id === nodeIdA);
    const nodeB = nodes.find((n) => n.id === nodeIdB);

    if (!nodeA || !nodeB) return null;

    // Direct edge between them
    const directEdge = edges.find(
      (e) => (e.source === nodeIdA && e.target === nodeIdB) || (e.source === nodeIdB && e.target === nodeIdA)
    );

    const reasons: string[] = [];
    const sharedConcepts: string[] = [];
    let relationship: RelationType = directEdge?.relationship || 'RELATED_TO';

    if (directEdge) {
      if (directEdge.reason) {
        reasons.push(directEdge.reason);
      }
      if (directEdge.similarity) {
        reasons.push(`High semantic similarity (${Math.round(directEdge.similarity * 100)}%)`);
      }
      if (directEdge.sharedConcepts && directEdge.sharedConcepts.length > 0) {
        sharedConcepts.push(...directEdge.sharedConcepts);
        reasons.push(`They share concepts: ${directEdge.sharedConcepts.join(', ')}`);
      }
    }

    // Check shared neighbors (e.g. shared collections, tags, or concepts)
    const neighborsA = new Set(edges.filter((e) => e.source === nodeIdA || e.target === nodeIdA).map((e) => e.source === nodeIdA ? e.target : e.source));
    const neighborsB = new Set(edges.filter((e) => e.source === nodeIdB || e.target === nodeIdB).map((e) => e.source === nodeIdB ? e.target : e.source));

    const commonNeighborIds = [...neighborsA].filter((id) => neighborsB.has(id));
    for (const commonId of commonNeighborIds) {
      const commonNode = nodes.find((n) => n.id === commonId);
      if (commonNode) {
        if (commonNode.type === 'Concept') {
          sharedConcepts.push(commonNode.label);
          reasons.push(`Both are linked to concept "${commonNode.label}"`);
        } else if (commonNode.type === 'Collection') {
          reasons.push(`Both are organized inside collection "${commonNode.label}"`);
        } else {
          reasons.push(`Both connect to "${commonNode.label}" (${commonNode.type})`);
        }
      }
    }

    if (reasons.length === 0) {
      reasons.push('Implicit structural proximity within your local knowledge graph.');
    }

    return {
      sourceNode: nodeA,
      targetNode: nodeB,
      relationship,
      reasons,
      sharedConcepts: Array.from(new Set(sharedConcepts)),
      semanticSimilarity: directEdge?.similarity,
      sources: [
        { id: nodeA.entityId, title: nodeA.label, type: nodeA.type },
        { id: nodeB.entityId, title: nodeB.label, type: nodeB.type },
      ],
    };
  }

  // Filter graph by node types and relationship types
  filterGraph(
    data: { nodes: GraphNode[]; edges: GraphEdge[] },
    selectedNodeTypes: NodeType[],
    selectedRelationships: RelationType[],
    searchQuery: string = ''
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const q = searchQuery.toLowerCase().trim();
    
    // Filter nodes
    const filteredNodes = data.nodes.filter((node) => {
      const matchesType = selectedNodeTypes.length === 0 || selectedNodeTypes.includes(node.type);
      const matchesQuery = !q || node.label.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges
    const filteredEdges = data.edges.filter((edge) => {
      const endpointsValid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
      const matchesRel = selectedRelationships.length === 0 || selectedRelationships.includes(edge.relationship);
      return endpointsValid && matchesRel;
    });

    return { nodes: filteredNodes, edges: filteredEdges };
  }
}

export const graphService = new GraphService();
