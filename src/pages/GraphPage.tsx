import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Search,
  ExternalLink,
} from 'lucide-react';
import { GraphNode, GraphEdge, NodeType, ConnectionExplanation } from '@/types/graph';
import { db } from '@/services/db/database';
import { graphService } from '@/services/graph/graphService';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/ui/Modal';

const NODE_COLORS: Record<NodeType, string> = {
  Document: '#3b82f6', // blue
  Note: '#6366f1', // indigo
  Concept: '#10b981', // emerald
  Topic: '#06b6d4', // cyan
  Collection: '#f59e0b', // amber
  Person: '#ec4899', // pink
  Project: '#8b5cf6', // purple
  Bookmark: '#14b8a6', // teal
};

export const GraphPage: React.FC = () => {
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<NodeType[]>([]);

  // Selection state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [secondSelectedNode, setSecondSelectedNode] = useState<GraphNode | null>(null);
  const [explanation, setExplanation] = useState<ConnectionExplanation | null>(null);

  // Canvas viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const loadGraph = useCallback(async () => {
    const data = await db.getGraphData();
    // Layout initial circular or clustered positions for nodes
    const n = data.nodes.length;
    const radius = Math.min(300, Math.max(120, n * 25));
    const layoutNodes = data.nodes.map((node, i) => {
      const angle = (i / (n || 1)) * 2 * Math.PI;
      return {
        ...node,
        x: node.x ?? Math.cos(angle) * radius + 400,
        y: node.y ?? Math.sin(angle) * radius + 250,
      };
    });
    setGraphData({ nodes: layoutNodes, edges: data.edges });
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(() => {
      if (isMounted) void loadGraph();
    });
    return () => {
      isMounted = false;
    };
  }, [loadGraph]);

  const filtered = useMemo(() => {
    return graphService.filterGraph(graphData, selectedTypes, [], searchQuery);
  }, [graphData, selectedTypes, searchQuery]);

  const handleNodeClick = async (node: GraphNode, event: React.MouseEvent) => {
    if (event.shiftKey && selectedNode && selectedNode.id !== node.id) {
      // Shift-click selects second node for "Why Are These Connected?"
      setSecondSelectedNode(node);
      const expl = await graphService.explainConnection(selectedNode.id, node.id);
      setExplanation(expl);
    } else {
      setSelectedNode(node);
      setSecondSelectedNode(null);
      setExplanation(null);
    }
  };

  const handleZoom = (delta: number) => {
    setZoom((z) => Math.min(2.5, Math.max(0.4, z + delta)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleNodeType = (type: NodeType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Node position map for rendering edges
  const nodeMap = useMemo(() => {
    return new Map(filtered.nodes.map((n) => [n.id, n]));
  }, [filtered.nodes]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px-28px)] overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 flex items-center justify-between text-xs gap-3">
        {/* Search inside Graph */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-faint)]" />
          <input
            type="text"
            placeholder="Search graph nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none"
            aria-label="Search graph nodes"
          />
        </div>

        {/* Node Type Quick Filters */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
          {(['Document', 'Note', 'Concept', 'Collection'] as NodeType[]).map((type) => {
            const active = selectedTypes.length === 0 || selectedTypes.includes(type);
            const color = NODE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleNodeType(type)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all flex items-center space-x-1 border ${
                  active
                    ? 'border-transparent text-white'
                    : 'border-[var(--border-subtle)] text-[var(--text-faint)] opacity-50'
                }`}
                style={{ backgroundColor: active ? color : 'transparent' }}
              >
                <span>{type}</span>
              </button>
            );
          })}
        </div>

        {/* View Controls */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => handleZoom(0.2)}
            className="p-1.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-0.2)}
            className="p-1.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]"
            title="Reset View"
            aria-label="Reset graph view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-[var(--bg-primary)] overflow-hidden select-none">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-[var(--text-faint)]">
            Loading Knowledge Graph...
          </div>
        ) : filtered.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Network}
              title="Graph is empty"
              description="Import documents or create notes to generate knowledge nodes and connections automatically."
              actionLabel="Import Documents"
              onAction={() => navigate('/imports')}
            />
          </div>
        ) : (
          <>
            {/* Instruction tooltip */}
            <div className="absolute top-3 left-3 z-10 px-2.5 py-1.5 rounded-md bg-[var(--bg-card)]/90 backdrop-blur-xs border border-[var(--border-subtle)] text-[11px] text-[var(--text-faint)] pointer-events-none">
              <span>Click a node to inspect · </span>
              <span className="font-semibold text-[var(--text-main)]">Shift + Click</span> another node to ask: <span className="italic">Why are these connected?</span>
            </div>

            <svg
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => {
                setIsDragging(true);
                dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
              }}
              onMouseMove={(e) => {
                if (isDragging) {
                  setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
                }
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Render Edges */}
                {filtered.edges.map((edge) => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target || source.x === undefined || target.x === undefined) return null;

                  const isHighlighted =
                    selectedNode && (selectedNode.id === source.id || selectedNode.id === target.id);

                  return (
                    <g key={edge.id}>
                      <line
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={isHighlighted ? '#3b82f6' : 'var(--border-subtle)'}
                        strokeWidth={isHighlighted ? 2 : 1}
                        strokeDasharray={edge.relationship === 'REFERENCES' ? '4 2' : undefined}
                      />
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {filtered.nodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const isSecondSelected = secondSelectedNode?.id === node.id;
                  const color = NODE_COLORS[node.type] || '#3b82f6';
                  const radius = 16 + (node.val || 1) * 3;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x ?? 400}, ${node.y ?? 250})`}
                      onClick={(e) => handleNodeClick(node, e)}
                      className="cursor-pointer"
                    >
                      {/* Node Glow / Ring if selected */}
                      {(isSelected || isSecondSelected) && (
                        <circle
                          r={radius + 6}
                          fill="none"
                          stroke={isSelected ? '#3b82f6' : '#10b981'}
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                      )}

                      <circle
                        r={radius}
                        fill={color}
                        className="transition-transform hover:opacity-90"
                        stroke="var(--bg-primary)"
                        strokeWidth="2"
                      />

                      <text
                        dy=".3em"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="600"
                        pointerEvents="none"
                      >
                        {node.label.slice(0, 3)}
                      </text>

                      {/* Node Label Below */}
                      <text
                        y={radius + 14}
                        textAnchor="middle"
                        fill="var(--text-main)"
                        fontSize="11"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </>
        )}

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-20 w-80 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-xl p-4 text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white uppercase"
                style={{ backgroundColor: NODE_COLORS[selectedNode.type] }}
              >
                {selectedNode.type}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedNode(null);
                  setSecondSelectedNode(null);
                  setExplanation(null);
                }}
                className="text-[var(--text-faint)] hover:text-[var(--text-main)] p-1"
                aria-label="Close details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[var(--text-main)] m-0">{selectedNode.label}</h4>
              <p className="text-[11px] text-[var(--text-faint)] mt-1">ID: {selectedNode.entityId}</p>
            </div>

            {/* Quick Actions based on type */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
              {selectedNode.type === 'Document' && (
                <button
                  type="button"
                  onClick={() => navigate('/knowledge')}
                  className="text-xs text-blue-500 hover:underline flex items-center space-x-1"
                >
                  <span>Open Document</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              {selectedNode.type === 'Note' && (
                <button
                  type="button"
                  onClick={() => navigate('/notes')}
                  className="text-xs text-indigo-500 hover:underline flex items-center space-x-1"
                >
                  <span>Open Note</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* "Why Are These Connected?" Modal */}
        <Modal
          isOpen={!!explanation}
          onClose={() => setExplanation(null)}
          title="Why Are These Connected?"
        >
          {explanation && (
            <div className="space-y-4 text-xs">
              {/* Nodes pair header */}
              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-faint)] block uppercase">Node A</span>
                  <span className="font-semibold text-[var(--text-main)]">{explanation.sourceNode.label}</span>
                </div>
                <div className="px-2 py-1 rounded bg-blue-600/10 text-blue-500 font-mono text-[10px] border border-blue-500/20">
                  {explanation.relationship}
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-faint)] block uppercase">Node B</span>
                  <span className="font-semibold text-[var(--text-main)]">{explanation.targetNode.label}</span>
                </div>
              </div>

              {/* Reasons list */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-main)] mb-2">Relationship Evidence:</h4>
                <ul className="space-y-2">
                  {explanation.reasons.map((r, i) => (
                    <li key={i} className="flex items-start space-x-2 text-[var(--text-muted)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Shared Concepts */}
              {explanation.sharedConcepts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-main)] mb-1.5">Shared Concepts:</h4>
                  <div className="flex flex-wrap gap-1">
                    {explanation.sharedConcepts.map((sc, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      >
                        {sc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Grounded Sources */}
              <div className="pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-faint)]">
                <span>Grounded Sources: </span>
                {explanation.sources.map((s) => s.title).join(' · ')}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};
