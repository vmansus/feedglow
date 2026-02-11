'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Search, ZoomIn, ZoomOut, Maximize2, X, ExternalLink, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useRouter } from 'next/navigation';
import { getAuthHeader } from '@/lib/auth';

interface GraphNode {
  id: number;
  title: string;
  feedId?: number;
  feedTitle?: string;
  publishedAt?: string;
  tags?: string[];
  type: 'article' | 'topic' | 'feed';
  size?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: number;
  target: number;
  type: 'similar' | 'same-topic' | 'same-feed' | 'reference';
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface RelatedArticle {
  entry: {
    id: number;
    title: string;
    feedTitle?: string;
    publishedAt: string;
  };
  type: string;
  weight: number;
}

export default function KnowledgePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // API data fetching
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GraphData | null>(null);

  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/knowledge/graph?withTopics=true&limit=100', {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to fetch graph');
      const graphData = await res.json();
      
      // Transform API data to our format
      const nodes: GraphNode[] = graphData.nodes.map((n: any) => ({
        id: n.id,
        title: n.title,
        feedId: n.feedId,
        feedTitle: n.feedTitle,
        publishedAt: n.publishedAt,
        tags: n.tags,
        type: n.type || 'article',
        size: n.size || (n.type === 'topic' ? 25 : 15),
      }));

      const edges: GraphEdge[] = graphData.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight,
      }));

      setData({ nodes, edges });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Fetch related articles when selecting an article node
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'article') {
      setRelatedArticles([]);
      return;
    }

    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const res = await fetch(`/api/knowledge/related/${selectedNode.id}?limit=5`, {
          headers: getAuthHeader(),
        });
        if (res.ok) {
          const data = await res.json();
          setRelatedArticles(data.related || []);
        }
      } catch (e) {
        console.error('Failed to fetch related articles:', e);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelated();
  }, [selectedNode]);

  // Resize observer to match canvas size to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Simple force-directed layout simulation
  const [nodes, setNodes] = useState<GraphNode[]>([]);

  useEffect(() => {
    if (!data?.nodes?.length || canvasSize.width === 0) return;

    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const radius = Math.min(centerX, centerY) * 0.5;

    // Initialize positions
    const initializedNodes = data.nodes.map((node, i) => ({
      ...node,
      x: Math.cos((i / data.nodes.length) * Math.PI * 2) * radius + centerX,
      y: Math.sin((i / data.nodes.length) * Math.PI * 2) * radius + centerY,
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
        node.vx! += (centerX - node.x!) * 0.01;
        node.vy! += (centerY - node.y!) * 0.01;
      });

      // Apply link forces
      data.edges.forEach(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
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
  }, [data, canvasSize]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes.length || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    data.edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target) return;

      ctx.beginPath();
      ctx.moveTo(source.x!, source.y!);
      ctx.lineTo(target.x!, target.y!);
      ctx.strokeStyle = edge.type === 'similar' ? 'rgba(249, 115, 22, 0.3)' 
        : edge.type === 'same-topic' ? 'rgba(59, 130, 246, 0.3)'
        : 'rgba(156, 163, 175, 0.2)';
      ctx.lineWidth = Math.max(1, edge.weight * 2);
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
      const label = node.title.slice(0, 20) + (node.title.length > 20 ? '...' : '');
      ctx.fillText(label, node.x!, node.y! + size + 14);
    });

    ctx.restore();
  }, [nodes, data, zoom, pan, selectedNode, canvasSize]);

  // Mouse handlers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ((e.clientX - rect.left) * scaleX - pan.x) / zoom;
    const y = ((e.clientY - rect.top) * scaleY - pan.y) / zoom;

    const clicked = nodes.find(node => {
      const dx = node.x! - x;
      const dy = node.y! - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = node.size || 15;
      return dist < hitRadius;
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
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
            <p className="text-xs text-muted">
              {data ? `${data.nodes.length} nodes · ${data.edges.length} connections` : 'Explore connections between articles'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGraph}
            disabled={isLoading}
            className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
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
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
              <p className="text-muted">Loading knowledge graph...</p>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-400 mb-2">Failed to load graph</p>
              <p className="text-muted text-sm mb-4">{error}</p>
              <button
                onClick={fetchGraph}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !data?.nodes.length ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Network className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))] mb-2">No data yet</h3>
              <p className="text-muted text-sm">
                Add articles to your knowledge graph by reading and saving articles. 
                The graph will show connections between topics and articles.
              </p>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute inset-0 cursor-move"
            style={{ width: '100%', height: '100%' }}
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
              className="absolute top-4 right-4 w-80 surface-elevated rounded-xl border border-default p-4 max-h-[calc(100%-2rem)] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    selectedNode.type === 'topic' ? 'bg-orange-500/20 text-orange-400'
                      : selectedNode.type === 'feed' ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-slate-500/20 text-slate-400'
                  )}>
                    {selectedNode.type}
                  </span>
                  <h3 className="font-semibold text-[rgb(var(--text-primary))] mt-2 break-words">{selectedNode.title}</h3>
                  {selectedNode.feedTitle && (
                    <p className="text-xs text-muted mt-1">{selectedNode.feedTitle}</p>
                  )}
                  {selectedNode.publishedAt && (
                    <p className="text-xs text-muted">{formatDate(selectedNode.publishedAt)}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 text-muted hover:text-[rgb(var(--text-primary))] ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedNode.type === 'article' && (
                <>
                  <button
                    onClick={() => router.push(`/entry/${selectedNode.id}`)}
                    className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400 mb-3"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open article
                  </button>

                  {/* Tags */}
                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-muted mb-1">Topics</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.tags.map((tag, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-[rgb(var(--bg-hover))] rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related articles */}
                  <div>
                    <p className="text-xs text-muted mb-2">Related articles</p>
                    {loadingRelated ? (
                      <div className="flex items-center gap-2 text-muted text-sm">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </div>
                    ) : relatedArticles.length > 0 ? (
                      <div className="space-y-2">
                        {relatedArticles.map((rel) => (
                          <button
                            key={rel.entry.id}
                            onClick={() => router.push(`/entry/${rel.entry.id}`)}
                            className="w-full text-left p-2 rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors"
                          >
                            <p className="text-sm text-[rgb(var(--text-primary))] line-clamp-2">{rel.entry.title}</p>
                            <p className="text-xs text-muted mt-1">
                              {rel.entry.feedTitle} · {formatDate(rel.entry.publishedAt)}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">No related articles found</p>
                    )}
                  </div>
                </>
              )}

              {selectedNode.type === 'topic' && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  Topic with related articles
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
