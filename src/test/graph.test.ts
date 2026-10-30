import { describe, it, expect } from 'vitest';
import { graphService } from '@/services/graph/graphService';
import { GraphNode, GraphEdge } from '@/types/graph';

describe('Graph Filtering and Grounded Explanations', () => {
  const sampleNodes: GraphNode[] = [
    { id: 'n1', label: 'WCAG 2.2', type: 'Concept', entityId: 'c1' },
    { id: 'n2', label: 'Form Focus Research.pdf', type: 'Document', entityId: 'd1' },
    { id: 'n3', label: 'Personal Accessibility Notes', type: 'Note', entityId: 'note1' },
    { id: 'n4', label: 'React Architecture', type: 'Topic', entityId: 't1' },
  ];

  const sampleEdges: GraphEdge[] = [
    {
      id: 'e1',
      source: 'n2',
      target: 'n1',
      relationship: 'REFERENCES',
      reason: 'Discusses WCAG focus criteria',
      similarity: 0.88,
      sharedConcepts: ['focus order', 'accessibility'],
      createdAt: '2026-01-01',
    },
    {
      id: 'e2',
      source: 'n3',
      target: 'n1',
      relationship: 'REFERENCES',
      reason: 'Captures personal findings on WCAG focus',
      createdAt: '2026-01-02',
    },
  ];

  it('should filter graph by node types correctly', () => {
    const filtered = graphService.filterGraph(
      { nodes: sampleNodes, edges: sampleEdges },
      ['Document'],
      []
    );

    expect(filtered.nodes.length).toBe(1);
    expect(filtered.nodes[0].label).toBe('Form Focus Research.pdf');
    // Edge to Concept n1 should be omitted since n1 is filtered out
    expect(filtered.edges.length).toBe(0);
  });

  it('should filter graph by label search query', () => {
    const filtered = graphService.filterGraph(
      { nodes: sampleNodes, edges: sampleEdges },
      [],
      [],
      'wcag'
    );

    expect(filtered.nodes.length).toBe(1);
    expect(filtered.nodes[0].label).toBe('WCAG 2.2');
  });

  it('should retain edges when both endpoints match filters', () => {
    const filtered = graphService.filterGraph(
      { nodes: sampleNodes, edges: sampleEdges },
      ['Document', 'Concept'],
      ['REFERENCES']
    );

    expect(filtered.nodes.length).toBe(2);
    expect(filtered.edges.length).toBe(1);
    expect(filtered.edges[0].id).toBe('e1');
  });
});
