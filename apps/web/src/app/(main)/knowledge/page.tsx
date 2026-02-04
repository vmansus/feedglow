'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Search, ZoomIn, ZoomOut, Maximize2, X, ExternalLink, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@feedglow/ui';
import * as api from '@/lib/api';

interface GraphNode {
  id: string;
  label: string;
  type: 'article' | 'topic' | 'feed';
  size?: number;
  color?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: 'similar' | 'same_topic' | 'references';
  strength?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function KnowledgePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['knowledge', 'graph', searchQuery],
    queryFn: () => api.getKnowledgeGraph(searchQuery || undefined),
    retry: false,
    throwOnError: false,
  });

  const { data: relatedEntries } = useQuery({
    queryKey: ['knowledge', 'related', selectedNode?.id],
    queryFn: () => selectedNode ? api.getRelatedEntries(selectedNode.id) : null,
    enabled: !!selectedNode && selectedNode.type === 'article',
    retry: false,
    throwOnError: false,
  });

  // Demo data for development
  const demoData: GraphData = {
    nodes: [
      { id: '1', label: 'AI & Machine Learning', type: 'topic', size: 30 },
      { id: '2', label: 'Web Development', type: 'topic', size: 25 },
      { id: '3', label: 'GPT-4 Deep Dive', type: 'article', size: 15 },
      { id: '4', label: 'React Server Components', type: 'article', size: 15 },
      { id: '5', label: 'Next.js 14 Features', type: 'article', size: 15 },
      { id: '6', label: 'LLM Fine-tuning Guide', type: 'article', size: 15 },
      { id: '7', label: 'OpenAI Blog', type: 'feed', size: 20 },
      { id: '8', label: 'Vercel Blog', type: 'feed', size: 20 },
      { id: '9', label: 'Cloud Computing', type: 'topic', size: 22 },
      { id: '10', label: 'AWS Lambda Guide', type: 'article', size: 15 },
    ],
    links: [
      { source: '1', target: '3', type: 'same_topic' },
      { source: '1', target: '6', type: 'same_topic' },
      { source: '2', target: '4', type: 'same_topic' },
      { source: '2', target: '5', type: 'same_topic' },
      { source: '7', target: '3', type: 'references' },
      { source: '7', target: '6', type: 'references' },
      { source: '8', target: '4', type: 'references' },
      { source: '8', target: '5', type: 'references' },
      { source: '4', target: '5', type: 'similar' },
      { source: '3', target: '6', type: 'similar' },
      { source: '9', target: '10', type: 'same_topic' },
      { source: '9', target: '1', type: 'similar' },
    ],
  };

  const data = (graphData?.nodes?.length ? graphData : null) || demoData;

  // Simple force-directed layout simulation
  const [nodes, setNodes] = useState<GraphNode[]>([]);

  useEffect(() => {
    if (!data?.nodes?.length) return;

    // Initialize positions
    const initializedNodes = data.nodes.map((node, i) => ({
      ...node,
      x: Math.cos((i / data.nodes.length) * Math.PI * 2) * 200 + 400,
      y: Math.sin((i / data.nodes.length) * Math.PI * 2) * 200 + 300,
      vx: 0,
      vy: 0,
    }));

    // Simple force simulation
    let animationId: number;
    let iteration = 0;
    const maxIterations = 300;

    const simulate = () => {
      if (iteration >= maxIterations) return;

      const nodeMap = new Map(initializedNodes.map(n => [n.id, n]));

      // Apply forces
      initializedNodes.forEach(node => {
        node.vx = 0;
        node.vy = 0;

        // Repulsion from other nodes
        initializedNodes.forEach(other => {
          if (node.id === other.id) return;
          const dx = node.x! - other.x!;
          const dy = node.y! - other.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 500 / (dist * dist);
          node.vx! += (dx / dist) * force;
          node.vy! += (dy / dist) * force;
        });

        // Attraction to center
        node.vx! += (400 - node.x!) * 0.01;
        node.vy! += (300 - node.y!) * 0.01;
      });

      // Apply link forces
      data.links.forEach(link => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;

        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.05;

        source.vx! += (dx / dist) * force;
        source.vy! += (dy / dist) * force;
        target.vx! -= (dx / dist) * force;
        target.vy! -= (dy / dist) * force;
      });

      // Update positions
      initializedNodes.forEach(node => {
        node.x! += node.vx! * 0.1;
        node.y! += node.vy! * 0.1;
      });

      setNodes([...initializedNodes]);
      iteration++;

      if (iteration < maxIterations) {
        animationId = requestAnimationFrame(simulate);
      }
    };

    simulate();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [data]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw links
    data.links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (!source || !target) return;

      ctx.beginPath();
      ctx.moveTo(source.x!, source.y!);
      ctx.lineTo(target.x!, target.y!);
      ctx.strokeStyle = link.type === 'similar' ? 'rgba(249, 115, 22, 0.3)' 
        : link.type === 'same_topic' ? 'rgba(59, 130, 246, 0.3)'
        : 'rgba(156, 163, 175, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const size = (node.size || 15) * (isSelected ? 1.3 : 1);

      // Glow effect
      if (isSelected || node.type === 'topic') {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size + 10, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(node.x!, node.y!, size, node.x!, node.y!, size + 10);
        gradient.addColorStop(0, 'rgba(249, 115, 22, 0.3)');
        gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'topic' ? '#f97316'
        : node.type === 'feed' ? '#3b82f6'
        : isSelected ? '#f97316' : '#64748b';
      ctx.fill();

      // Label
      ctx.fillStyle = '#e5e5e5';
      ctx.font = `${isSelected ? 'bold' : 'normal'} 11px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.label.slice(0, 20) + (node.label.length > 20 ? '...' : ''), node.x!, node.y! + size + 14);
    });

    ctx.restore();
  }, [nodes, data.links, zoom, pan, selectedNode]);

  // Mouse handlers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    const clicked = nodes.find(node => {
      const dx = node.x! - x;
      const dy = node.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < (node.size || 15);
    });

    setSelectedNode(clicked || null);
  }, [nodes, pan, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 3));
  };

  return (
    <div className="h-full flex flex-col surface-base">
      {/* Header */}
      <div className="p-4 border-b border-default flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
            style={{ boxShadow: '0 0 25px rgba(249, 115, 22, 0.4)' }}
          >
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--text-primary))]">Knowledge Graph</h1>
            <p className="text-xs text-muted">Explore connections between articles</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics..."
              className="pl-9 pr-4 py-2 w-48 rounded-lg bg-[rgb(var(--bg-elevated))] border border-default text-sm text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
          <div className="flex gap-1 border border-default rounded-lg p-1">
            <button
              onClick={() => setZoom(z => Math.min(z * 1.2, 3))}
              className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(z * 0.8, 0.3))}
              className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network className="w-12 h-12 text-orange-500 animate-pulse mx-auto mb-4" />
              <p className="text-muted">Building knowledge graph...</p>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full cursor-move"
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 surface-elevated rounded-lg border border-default p-3 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-muted">Topic</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-muted">Feed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-500" />
            <span className="text-muted">Article</span>
          </div>
        </div>

        {/* Node Detail Panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-4 right-4 w-72 surface-elevated rounded-xl border border-default p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    selectedNode.type === 'topic' ? 'bg-orange-500/20 text-orange-400'
                      : selectedNode.type === 'feed' ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-slate-500/20 text-slate-400'
                  )}>
                    {selectedNode.type}
                  </span>
                  <h3 className="font-semibold text-[rgb(var(--text-primary))] mt-2">{selectedNode.label}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 text-muted hover:text-[rgb(var(--text-primary))]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedNode.type === 'article' && (
                <>
                  <a
                    href={`/entry/${selectedNode.id}`}
                    className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400 mb-3"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open article
                  </a>

                  {relatedEntries && (
                    <div>
                      <h4 className="text-xs text-muted uppercase tracking-wider mb-2">Related</h4>
                      <div className="space-y-2">
                        {relatedEntries.entries?.slice(0, 3).map((entry: any) => (
                          <a
                            key={entry.id}
                            href={`/entry/${entry.id}`}
                            className="block text-sm text-secondary hover:text-[rgb(var(--text-primary))] truncate"
                          >
                            {entry.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedNode.type === 'topic' && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  Click to explore related articles
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
