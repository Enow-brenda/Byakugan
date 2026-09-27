import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CodebaseNode, CodebaseEdge, SkillLevel, TabType } from '../types';
import { NODES_DATA, EDGES_DATA } from '../data/mockData';
import { 
  Search, 
  Filter, 
  Lock, 
  Unlock, 
  Plus, 
  Minus, 
  Maximize2, 
  RotateCcw, 
  Crosshair, 
  Bolt, 
  Share2, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';

interface ChakraNetworkViewProps {
  skillLevel: SkillLevel;
  onNavigateTab: (tab: TabType) => void;
  onSelectInspectFile?: (filename: string) => void;
}

export const ChakraNetworkView: React.FC<ChakraNetworkViewProps> = ({
  skillLevel,
  onNavigateTab,
  onSelectInspectFile,
}) => {
  // State
  const [selectedNodeId, setSelectedNodeId] = useState<string>("RefundService.js");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CodebaseEdge | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [legendOpen, setLegendOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Viewport Pan/Zoom
  const [scale, setScale] = useState<number>(1.05);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 380, y: 350 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Nodes local positions for dragging
  const [nodes, setNodes] = useState<CodebaseNode[]>(() => NODES_DATA.map(n => ({ ...n })));

  // Dragging state
  const draggingNodeRef = useRef<CodebaseNode | null>(null);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const settleAnimationRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Compute 1st and 2nd degree neighbors
  const getDegrees = useCallback((focalId: string) => {
    const first = new Set<string>();
    const second = new Set<string>();

    EDGES_DATA.forEach(e => {
      if (e.source === focalId) first.add(e.target);
      if (e.target === focalId) first.add(e.source);
    });

    first.forEach(id1 => {
      EDGES_DATA.forEach(e => {
        if (e.source === id1 && e.target !== focalId && !first.has(e.target)) second.add(e.target);
        if (e.target === id1 && e.source !== focalId && !first.has(e.source)) second.add(e.source);
      });
    });

    return { first, second };
  }, []);

  // Center on node coordinates
  const centerOn = useCallback((x: number, y: number, newScale?: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentScale = newScale ?? scale;
    setPan({
      x: rect.width / 2 - x * currentScale,
      y: rect.height / 2 - y * currentScale
    });
    if (newScale) setScale(newScale);
  }, [scale]);

  // Initial center on mount
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2,
        y: rect.height / 2
      });
      setScale(1.05);
    }
  }, []);

  // Reset view to RefundService.js
  const handleResetView = () => {
    setScale(1.05);
    centerOn(0, 0, 1.05);
    setSelectedNodeId("RefundService.js");
    setSelectedEdge(null);
    showToast("Centered on RefundService.js");
  };

  // Fit all nodes into view
  const handleFitView = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });

    const graphWidth = (maxX - minX) + 160;
    const graphHeight = (maxY - minY) + 160;

    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.55), 1.25);

    setScale(targetScale);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    setPan({
      x: rect.width / 2 - midX * targetScale,
      y: rect.height / 2 - midY * targetScale
    });
    showToast("Framed 22 connected modules");
  };

  // Canvas Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingNodeRef.current) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
    } else if (draggingNodeRef.current) {
      handleNodeDrag(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
    if (draggingNodeRef.current) endNodeDrag();
  };

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.45), 2.2);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan({
        x: mouseX - (mouseX - pan.x) * (newScale / scale),
        y: mouseY - (mouseY - pan.y) * (newScale / scale)
      });
      setScale(newScale);
    }
  };

  // Node Dragging Physics
  const startNodeDrag = (node: CodebaseNode, clientX: number, clientY: number) => {
    if (isLocked) return;
    if (settleAnimationRef.current) {
      cancelAnimationFrame(settleAnimationRef.current);
      settleAnimationRef.current = null;
    }

    draggingNodeRef.current = node;
    dragStartMouseRef.current = { x: clientX, y: clientY };

    dragStartPositionsRef.current.clear();
    nodes.forEach(n => {
      dragStartPositionsRef.current.set(n.id, { x: n.x, y: n.y });
    });
  };

  const handleNodeDrag = (clientX: number, clientY: number) => {
    const dragging = draggingNodeRef.current;
    if (!dragging) return;

    const dx = (clientX - dragStartMouseRef.current.x) / scale;
    const dy = (clientY - dragStartMouseRef.current.y) / scale;

    const initialPos = dragStartPositionsRef.current.get(dragging.id);
    if (!initialPos) return;

    const { first, second } = getDegrees(dragging.id);

    setNodes(prev => prev.map(n => {
      if (n.id === dragging.id) {
        return { ...n, x: initialPos.x + dx, y: initialPos.y + dy };
      }
      if (first.has(n.id)) {
        const init = dragStartPositionsRef.current.get(n.id);
        if (init) return { ...n, x: init.x + dx * 0.22, y: init.y + dy * 0.22 };
      }
      if (second.has(n.id)) {
        const init = dragStartPositionsRef.current.get(n.id);
        if (init) return { ...n, x: init.x + dx * 0.08, y: init.y + dy * 0.08 };
      }
      return n;
    }));
  };

  const endNodeDrag = () => {
    const dragging = draggingNodeRef.current;
    if (!dragging) return;

    const startTime = performance.now();
    const duration = 260; // ms

    const currentSnapshot = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => currentSnapshot.set(n.id, { x: n.x, y: n.y }));

    const targetPositions = new Map<string, { x: number; y: number }>();
    const { first, second } = getDegrees(dragging.id);

    nodes.forEach(n => {
      if (n.id === dragging.id) {
        targetPositions.set(n.id, { x: n.x, y: n.y });
      } else if (first.has(n.id)) {
        const init = dragStartPositionsRef.current.get(n.id);
        const curr = currentSnapshot.get(n.id);
        if (init && curr) {
          targetPositions.set(n.id, {
            x: init.x + (curr.x - init.x) * 0.5,
            y: init.y + (curr.y - init.y) * 0.5
          });
        }
      } else if (second.has(n.id)) {
        const init = dragStartPositionsRef.current.get(n.id);
        const curr = currentSnapshot.get(n.id);
        if (init && curr) {
          targetPositions.set(n.id, {
            x: init.x + (curr.x - init.x) * 0.3,
            y: init.y + (curr.y - init.y) * 0.3
          });
        }
      } else {
        const init = dragStartPositionsRef.current.get(n.id);
        if (init) targetPositions.set(n.id, { x: init.x, y: init.y });
      }
    });

    const settleStep = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      setNodes(prev => prev.map(n => {
        const start = currentSnapshot.get(n.id);
        const target = targetPositions.get(n.id);
        if (start && target) {
          return {
            ...n,
            x: start.x + (target.x - start.x) * ease,
            y: start.y + (target.y - start.y) * ease
          };
        }
        return n;
      }));

      if (progress < 1) {
        settleAnimationRef.current = requestAnimationFrame(settleStep);
      } else {
        settleAnimationRef.current = null;
      }
    };

    settleAnimationRef.current = requestAnimationFrame(settleStep);
    draggingNodeRef.current = null;
  };

  // Keyboard ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById("chakra-search-input");
        if (input) input.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered nodes & degrees
  const { first: firstDegree, second: secondDegree } = getDegrees(selectedNodeId);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];
  const outgoingEdges = EDGES_DATA.filter(e => e.source === selectedNode.id);
  const incomingEdges = EDGES_DATA.filter(e => e.target === selectedNode.id);

  // Jump to Impact Sight with active file
  const handleGoToImpact = (filename: string) => {
    if (onSelectInspectFile) onSelectInspectFile(filename);
    onNavigateTab('impact');
  };

  const getEdgeLabel = (edge: CodebaseEdge) => {
    if (skillLevel === 'beginner') {
      if (edge.relation === 'calls') return 'sends to';
      if (edge.relation === 'writes') return 'saves in';
      if (edge.relation === 'reads') return 'reads from';
      if (edge.relation === 'publishes') return 'notifies';
      if (edge.relation === 'tests') return 'checks';
      return edge.relation;
    }
    if (skillLevel === 'senior') {
      return `${edge.relation.toUpperCase()} [L:${edge.loc}]`;
    }
    return `${edge.relation} :${edge.loc}`;
  };

  const filteredMatches = searchQuery.trim()
    ? nodes.filter(n =>
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden select-none bg-[#0b1326] relative">
      {/* Sub-Header: Filter Chips & Search Ribbon */}
      <div className="h-12 bg-[#060e20]/95 backdrop-blur-md px-4 sm:px-6 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(76,215,246,0.8)]" />
            <h1 className="font-semibold text-xs sm:text-sm text-white tracking-tight flex items-center gap-2">
              Chakra Network
              <span className="text-slate-400 font-mono text-[10px] tracking-normal px-1.5 py-0.5 rounded bg-[#171f33] border border-slate-700/60 hidden sm:inline">
                AST-KNOWLEDGE-GRAPH
              </span>
            </h1>
          </div>

          {/* Filter Chips Ribbon */}
          <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-slate-800">
            {['ALL', 'Service', 'Controller', 'Repository', 'Model', 'External'].map(cat => {
              const count = cat === 'ALL' ? nodes.length : nodes.filter(n => n.type === cat || n.category === cat).length;
              const isActive = activeFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setActiveFilter(cat);
                    showToast(`Filtered: ${cat}`);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1 ${
                    isActive
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 font-semibold'
                      : 'bg-[#171f33] text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{cat === 'ALL' ? 'All' : cat + 's'}</span>
                  <span className="text-[9px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Center Actions */}
        <div className="flex items-center gap-2">
          {/* Autocomplete Search */}
          <div className="relative w-44 sm:w-64" ref={searchContainerRef}>
            <div className="flex items-center bg-[#131b2e] border border-slate-700/80 rounded px-2.5 py-1 focus-within:border-indigo-400 transition-all">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <input
                id="chakra-search-input"
                type="text"
                autoComplete="off"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchDropdownOpen(true);
                }}
                onFocus={() => setSearchDropdownOpen(true)}
                placeholder="Search nodes..."
                className="bg-transparent text-white text-xs w-full focus:outline-none placeholder:text-slate-400 font-mono"
              />
              <kbd className="font-mono text-[10px] text-slate-400 bg-[#171f33] px-1 rounded ml-1 hidden sm:inline">⌘K</kbd>
            </div>

            {/* Dropdown */}
            {searchDropdownOpen && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c2742] border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto z-50 py-1 font-mono text-xs">
                {filteredMatches.length === 0 ? (
                  <div className="p-2.5 text-slate-400 text-center">No nodes found</div>
                ) : (
                  filteredMatches.map(m => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSelectedNodeId(m.id);
                        setSelectedEdge(null);
                        centerOn(m.x, m.y);
                        setSearchDropdownOpen(false);
                        setSearchQuery("");
                        showToast(`Focused: ${m.name}`);
                      }}
                      className="px-3 py-1.5 hover:bg-[#283659] flex items-center justify-between cursor-pointer text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="font-medium text-white">{m.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{m.type}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Center Selected Button */}
          <button
            type="button"
            onClick={() => {
              if (selectedNode) centerOn(selectedNode.x, selectedNode.y);
            }}
            className="hidden sm:flex items-center gap-1 bg-[#171f33] hover:bg-[#222a3d] text-slate-200 px-2.5 py-1 rounded text-xs border border-slate-700/60 transition-all font-mono"
            title="Center Selected Node"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
            <span>Center</span>
          </button>

          {/* Lock mode toggle */}
          <button
            type="button"
            onClick={() => {
              setIsLocked(!isLocked);
              showToast(isLocked ? "Node positions unlocked" : "Positions locked");
            }}
            className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${
              isLocked
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                : 'bg-[#171f33] text-cyan-400 border-slate-700/60 hover:bg-[#222a3d]'
            }`}
            title={isLocked ? "Positions Locked (Click to Unlock)" : "Drag Mode Active (Click to Lock)"}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Workspace (Canvas + Inspector) */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Dominant Canvas Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className={`relative flex-1 h-full overflow-hidden select-none bg-[#0b1326] ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1.2px, transparent 1.2px)',
            backgroundSize: '24px 24px'
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-auto">
            <defs>
              <marker id="arrow-default" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="24" refY="3.5" viewBox="0 0 7 7">
                <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill="#464554" />
              </marker>
              <marker id="arrow-primary" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="24" refY="3.5" viewBox="0 0 7 7">
                <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill="#c0c1ff" />
              </marker>
              <marker id="arrow-secondary" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="24" refY="3.5" viewBox="0 0 7 7">
                <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill="#4cd7f6" />
              </marker>
              <marker id="arrow-emerald" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="24" refY="3.5" viewBox="0 0 7 7">
                <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill="#34d399" />
              </marker>
              <filter height="300%" id="focal-glow" width="300%" x="-100%" y="-100%">
                <feGaussianBlur result="blur" stdDeviation="12" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Edges Layer */}
              <g id="edges-layer">
                {EDGES_DATA.map((edge, idx) => {
                  const src = nodes.find(n => n.id === edge.source);
                  const tgt = nodes.find(n => n.id === edge.target);
                  if (!src || !tgt) return null;

                  // Category filter check
                  if (activeFilter !== "ALL") {
                    const srcMatch = src.type === activeFilter || src.category === activeFilter;
                    const tgtMatch = tgt.type === activeFilter || tgt.category === activeFilter;
                    if (!srcMatch && !tgtMatch) return null;
                  }

                  const isDirect = (edge.source === selectedNodeId || edge.target === selectedNodeId);
                  const isHoverDirect = hoveredNodeId && (edge.source === hoveredNodeId || edge.target === hoveredNodeId);
                  const isSelectedEdge = selectedEdge && selectedEdge.source === edge.source && selectedEdge.target === edge.target;

                  let strokeColor = "#464554";
                  let strokeWidth = 1.25;
                  let strokeDash = "none";
                  let opacity = 0.22;
                  let marker = "arrow-default";

                  if (edge.relation === "reads" || edge.relation === "tests") {
                    strokeDash = "4,4";
                  }

                  if (isDirect) {
                    opacity = 0.95;
                    strokeWidth = 2.2;
                    if (edge.source === selectedNodeId) {
                      strokeColor = "#c0c1ff";
                      marker = "arrow-primary";
                    } else {
                      strokeColor = "#4cd7f6";
                      marker = "arrow-secondary";
                    }
                  } else if (isHoverDirect && !selectedEdge) {
                    opacity = 0.75;
                    strokeWidth = 1.8;
                    strokeColor = "#4edea3";
                    marker = "arrow-emerald";
                  } else if (selectedNodeId) {
                    opacity = 0.10;
                  }

                  if (isSelectedEdge) {
                    strokeColor = "#ec4899";
                    strokeWidth = 2.8;
                    opacity = 1;
                  }

                  // Curve calculation
                  const dx = tgt.x - src.x;
                  const dy = tgt.y - src.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const curvature = Math.min(25, dist * 0.12);
                  const mx = (src.x + tgt.x) / 2 - (dy / (dist || 1)) * curvature;
                  const my = (src.y + tgt.y) / 2 + (dx / (dist || 1)) * curvature;
                  const pathData = `M ${src.x} ${src.y} Q ${mx} ${my} ${tgt.x} ${tgt.y}`;

                  return (
                    <g key={`edge-${idx}`}>
                      <path
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDash}
                        opacity={opacity}
                        markerEnd={`url(#${marker})`}
                        style={{ transition: "stroke 140ms ease-out, opacity 140ms ease-out, stroke-width 140ms ease-out" }}
                      />
                      {/* Clickable hit path */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="16"
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEdge(edge);
                          showToast(`Connection: ${edge.source} → ${edge.target}`);
                        }}
                      />
                      {/* Edge Label for direct connections */}
                      {(isDirect || isHoverDirect) && (
                        <text
                          x={mx}
                          y={my - 4}
                          textAnchor="middle"
                          fill={isDirect ? "#c7c4d7" : "#4edea3"}
                          fontFamily="JetBrains Mono"
                          fontSize={skillLevel === 'beginner' ? "11px" : "10px"}
                          fontWeight="500"
                          opacity="0.9"
                          className="pointer-events-none select-none"
                        >
                          {getEdgeLabel(edge)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Nodes Layer */}
              <g id="nodes-layer">
                {nodes.map(node => {
                  let isFilteredOut = false;
                  if (activeFilter !== "ALL") {
                    isFilteredOut = !(node.type === activeFilter || node.category === activeFilter);
                  }

                  const isSelected = (node.id === selectedNodeId);
                  const isHovered = (node.id === hoveredNodeId);
                  const is1st = firstDegree.has(node.id);
                  const is2nd = secondDegree.has(node.id);

                  let opacity = 1;
                  if (isFilteredOut) {
                    opacity = 0.08;
                  } else if (selectedNodeId) {
                    if (isSelected) opacity = 1;
                    else if (is1st) opacity = 1;
                    else if (is2nd) opacity = 0.55;
                    else opacity = 0.15;
                  }

                  if (isHovered && !isSelected) {
                    opacity = Math.max(opacity, 0.95);
                  }

                  let glyph = "⚡";
                  if (node.type === "Controller") glyph = "⇄";
                  else if (node.type === "Repository" || node.type === "Database") glyph = "⛁";
                  else if (node.type === "Model") glyph = "⬡";
                  else if (node.type === "Test") glyph = "✓";
                  else if (node.type === "External API" || node.type === "Queue") glyph = "☁";
                  else if (node.type === "Worker" || node.type.includes("Cache")) glyph = "⚙";

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      opacity={opacity}
                      style={{ transition: "opacity 140ms ease-out" }}
                    >
                      {/* Focal halo for selected node */}
                      {isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.r + 10}
                          fill={node.color}
                          fillOpacity="0.28"
                          filter="url(#focal-glow)"
                          className="pointer-events-none"
                        />
                      )}

                      {/* Dashed outer ring for critical/high impact */}
                      {(node.riskScore.startsWith("8") || node.riskScore.startsWith("7")) && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.r + 4}
                          fill="none"
                          stroke={node.isFocal ? "#f43f5e" : "#ffb4ab"}
                          strokeWidth="1.2"
                          strokeDasharray="3 2"
                          opacity={isSelected ? "0.9" : "0.5"}
                          className="pointer-events-none"
                        />
                      )}

                      {/* Hover ring */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r + 5}
                        fill="none"
                        stroke="#4edea3"
                        strokeWidth="2"
                        opacity={isHovered && !isSelected ? "0.85" : "0"}
                        className="node-hover-ring pointer-events-none"
                      />

                      {/* Core circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r}
                        fill={isSelected ? node.color : "#131b2e"}
                        stroke={isHovered ? "#4edea3" : node.color}
                        strokeWidth={isSelected ? "2.8" : isHovered ? "2.4" : "1.8"}
                        className="pointer-events-none"
                        style={{ transition: "stroke 140ms ease-out, stroke-width 140ms ease-out, fill 140ms ease-out" }}
                      />

                      {/* Glyph */}
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        fill={isSelected ? "#060e20" : node.color}
                        fontFamily="JetBrains Mono"
                        fontSize={`${Math.round(node.r * 0.7)}px`}
                        fontWeight="bold"
                        className="pointer-events-none select-none"
                      >
                        {glyph}
                      </text>

                      {/* Label */}
                      <text
                        x={node.x}
                        y={node.y + node.r + 14}
                        textAnchor="middle"
                        fill={isSelected ? "#ffffff" : isHovered ? "#dae2fd" : "#c7c4d7"}
                        fontFamily="Inter, sans-serif"
                        fontSize={isSelected ? "12px" : "11px"}
                        fontWeight={isSelected ? "600" : "500"}
                        className="pointer-events-none select-none drop-shadow-md"
                      >
                        {node.name}
                      </text>

                      {/* Stationary invisible hitbox with generous padding */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r + 12}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            startNodeDrag(node, e.clientX, e.clientY);
                            e.stopPropagation();
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.id);
                          setSelectedEdge(null);
                          showToast(`Focused: ${node.name}`);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {/* Floating Bottom-Left Canvas Navigation Controls */}
          <div className="absolute bottom-5 left-5 z-20 flex items-center bg-[#060e20]/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-1 shadow-2xl">
            <button
              type="button"
              onClick={() => setScale(s => Math.min(s * 1.2, 2.2))}
              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale(s => Math.max(s * 0.8, 0.45))}
              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-0.5" />
            <button
              type="button"
              onClick={handleFitView}
              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Fit to View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Reset View & Center RefundService"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Floating Bottom-Right Collapsible Legend */}
          <div className="absolute bottom-5 right-5 z-20 bg-[#060e20]/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl transition-all w-52 overflow-hidden">
            <div
              onClick={() => setLegendOpen(!legendOpen)}
              className="flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
            >
              <span className="font-mono text-[11px] font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Nodes &amp; Edges
              </span>
              {legendOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
            </div>

            {legendOpen && (
              <div className="px-3 py-2.5 space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ec4899' }} /><span className="text-white">Core Focal Service</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#a855f7' }} /><span className="text-slate-300">Services (Domain)</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#38bdf8' }} /><span className="text-slate-300">Controllers (HTTP API)</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#34d399' }} /><span className="text-slate-300">Repositories &amp; DB</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} /><span className="text-slate-300">Models &amp; Entities</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} /><span className="text-slate-300">Gateways &amp; Queues</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#06b6d4' }} /><span className="text-slate-300">Test Harness</span></div>
                <div className="pt-2 mt-1 border-t border-slate-800 space-y-1 text-[10px] text-slate-400">
                  <div className="flex items-center justify-between"><span>calls / writes</span><span className="text-indigo-400 font-mono">────►</span></div>
                  <div className="flex items-center justify-between"><span>reads / tests</span><span className="text-cyan-400 font-mono">- - ─►</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT DETAIL INSPECTION DRAWER (~330px) */}
        <aside className="w-[330px] shrink-0 bg-[#0d1527] border-l border-slate-800 flex flex-col justify-between overflow-hidden z-20 shadow-2xl">
          <div className="p-4 overflow-y-auto flex flex-col gap-3.5 flex-1">
            {selectedEdge ? (
              // Edge Inspector Mode
              <div className="space-y-4">
                <div className="flex flex-col gap-1 pb-2 border-b border-slate-800">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 inline-block w-fit">
                    {skillLevel === 'beginner' ? 'HOW THEY CONNECT' : 'CONNECTION CONTRACT'}
                  </span>
                  <h2 className="text-base font-bold text-white flex items-center gap-1.5 mt-1 font-mono">
                    <span>{getEdgeLabel(selectedEdge)}</span>
                  </h2>
                </div>

                <div className="bg-[#131b2e] rounded-xl p-3 space-y-2 border border-slate-700/80 font-mono">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">{skillLevel === 'beginner' ? 'Sender' : 'Caller Node'}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(selectedEdge.source);
                        setSelectedEdge(null);
                        const n = nodes.find(item => item.id === selectedEdge.source);
                        if (n) centerOn(n.x, n.y);
                      }}
                      className="mt-0.5 flex items-center gap-1.5 text-white hover:text-indigo-400 font-semibold text-left text-xs"
                    >
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      {selectedEdge.source}
                    </button>
                  </div>
                  <div className="text-center text-cyan-400 text-[11px]">────── {selectedEdge.relation} ──────►</div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">{skillLevel === 'beginner' ? 'Receiver' : 'Callee Node'}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(selectedEdge.target);
                        setSelectedEdge(null);
                        const n = nodes.find(item => item.id === selectedEdge.target);
                        if (n) centerOn(n.x, n.y);
                      }}
                      className="mt-0.5 flex items-center gap-1.5 text-white hover:text-indigo-400 font-semibold text-left text-xs"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      {selectedEdge.target}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {skillLevel === 'beginner' ? 'Plain Explanation' : 'Runtime Invocation Contract'}
                  </h3>
                  <div className="bg-[#060e20] rounded-xl p-2.5 font-mono text-[11px] text-cyan-300 border border-slate-800 overflow-x-auto">
                    <code>
                      {skillLevel === 'beginner' && selectedEdge.beginner
                        ? selectedEdge.beginner
                        : skillLevel === 'senior' && selectedEdge.senior
                        ? selectedEdge.senior
                        : selectedEdge.contract}
                    </code>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    centerOn(0, 0);
                    setSelectedNodeId("RefundService.js");
                    setSelectedEdge(null);
                  }}
                  className="w-full bg-[#171f33] hover:bg-[#222a3d] text-white py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
                >
                  <span>Return to RefundService.js</span>
                </button>
              </div>
            ) : (
              // Node Inspector Mode
              <div className="space-y-3.5">
                {/* Top Pill & File Info */}
                <div className="flex flex-col gap-1 pb-2 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <span 
                      className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ 
                        backgroundColor: `${selectedNode.color}25`, 
                        color: selectedNode.color,
                        border: `1px solid ${selectedNode.color}50` 
                      }}
                    >
                      {selectedNode.type}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {selectedNode.loc ? `${selectedNode.loc} LOC` : 'INFRA'}
                    </span>
                  </div>
                  <h2 className="font-bold text-base text-white truncate mt-1" title={selectedNode.name}>
                    {selectedNode.name}
                  </h2>
                  <div className="font-mono text-[11px] text-slate-400 truncate" title={selectedNode.path}>
                    {selectedNode.path}
                  </div>
                </div>

                {/* AST Blast Telemetry Box */}
                <div className="bg-[#131b2e] border border-slate-700/80 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-cyan-400 font-semibold flex items-center gap-1">
                      <Crosshair className="w-3.5 h-3.5" />
                      AST Blast Telemetry
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 font-bold border border-rose-800">
                      {selectedNode.riskLevel}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-300 leading-snug font-sans">
                    Simulate runtime call stack mutation &amp; regression ripple through dependent clusters.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGoToImpact(selectedNode.name)}
                    className="w-full mt-0.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md group"
                  >
                    <Bolt className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform text-amber-300" />
                    <span>View in Impact Sight</span>
                    <span className="font-mono text-[10px] opacity-80">#impact</span>
                  </button>
                </div>

                {/* Architectural Role (Adapted to Skill Level) */}
                <div className="space-y-1">
                  <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {skillLevel === 'beginner' ? 'What It Does' : 'Architectural Role'}
                  </h3>
                  <p className="text-[12px] text-slate-200 leading-relaxed bg-[#131b2e] rounded-xl p-2.5 border border-slate-800 font-sans">
                    {skillLevel === 'beginner' && selectedNode.beginner
                      ? selectedNode.beginner.whatItDoes
                      : skillLevel === 'senior' && selectedNode.senior
                      ? selectedNode.senior.archRole
                      : selectedNode.role}
                  </p>
                </div>

                {/* Dependencies Outgoing */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Dependencies (Outgoing)
                    </h3>
                    <span className="font-mono text-[10px] text-indigo-400">{outgoingEdges.length} nodes</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {outgoingEdges.length === 0 ? (
                      <span className="font-mono text-[11px] text-slate-500 italic">No outbound dependencies</span>
                    ) : (
                      outgoingEdges.map(edge => {
                        const targetNode = nodes.find(n => n.id === edge.target);
                        return (
                          <button
                            key={edge.target}
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(edge.target);
                              if (targetNode) centerOn(targetNode.x, targetNode.y);
                              showToast(`Jumped to: ${edge.target}`);
                            }}
                            className="flex items-center gap-1 bg-[#131b2e] hover:bg-[#1f2c4a] px-2 py-0.5 rounded-md text-left border border-slate-800 transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: targetNode?.color || '#fff' }} />
                            <span className="font-mono text-[10px] text-slate-200 truncate max-w-[120px]">{edge.target}</span>
                            <span className="font-mono text-[9px] text-slate-500">:L{edge.loc}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Dependents Incoming */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Dependents (Incoming Callers)
                    </h3>
                    <span className="font-mono text-[10px] text-cyan-400">{incomingEdges.length} callers</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {incomingEdges.length === 0 ? (
                      <span className="font-mono text-[11px] text-slate-500 italic">No incoming callers</span>
                    ) : (
                      incomingEdges.map(edge => {
                        const sourceNode = nodes.find(n => n.id === edge.source);
                        return (
                          <button
                            key={edge.source}
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(edge.source);
                              if (sourceNode) centerOn(sourceNode.x, sourceNode.y);
                              showToast(`Jumped to: ${edge.source}`);
                            }}
                            className="flex items-center gap-1 bg-[#131b2e] hover:bg-[#1f2c4a] px-2 py-0.5 rounded-md text-left border border-slate-800 transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sourceNode?.color || '#fff' }} />
                            <span className="font-mono text-[10px] text-slate-200 truncate max-w-[120px]">{edge.source}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Relationship Breakdown */}
                <div className="space-y-1">
                  <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Relationship Breakdown
                  </h3>
                  <div className="bg-[#060e20] border border-slate-800 rounded-xl p-2.5 font-mono text-[10px] space-y-1 text-slate-300 max-h-32 overflow-y-auto">
                    {outgoingEdges.map(e => (
                      <div key={`out-${e.target}`}>
                        ├─ <span className="text-indigo-400">{e.relation}</span> → <span className="text-white">{e.target}</span>:<span className="text-slate-500">{e.loc}</span>
                      </div>
                    ))}
                    {incomingEdges.map(e => (
                      <div key={`in-${e.source}`}>
                        ▲ <span className="text-cyan-400">called by</span> ← <span className="text-white">{e.source}</span>:<span className="text-slate-500">{e.loc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Complexity & Warnings */}
                <div className="space-y-1.5 pt-1">
                  <h3 className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Complexity &amp; Warnings
                  </h3>
                  <div className="bg-[#131b2e] rounded-xl p-2.5 space-y-1.5 border border-slate-800 font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Cyclomatic Complexity</span>
                      <span className="text-white font-semibold">{selectedNode.complexity}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Blast Radius Score</span>
                      <span className="text-rose-400 font-semibold">{selectedNode.riskScore}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-300">
                      <span className="text-rose-400 block mb-0.5 font-semibold">AST Mutation Flag:</span>
                      <code className="text-[10px] text-slate-200 block bg-[#060e20] p-1.5 rounded overflow-x-auto border border-slate-800">
                        {selectedNode.astFlag}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-3 bg-[#060e20] border-t border-slate-800 flex items-center justify-between shrink-0 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">22 Connected Nodes</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                showToast("Graph permalink copied to clipboard");
              }}
              className="text-indigo-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Copy Link</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#171f33] border border-slate-700 px-4 py-2 rounded-xl shadow-2xl text-white font-mono text-xs z-50 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
