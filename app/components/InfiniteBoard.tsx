"use client";

import { useState, useRef, useEffect } from 'react';
import { Note, extractYouTubeIds } from '../page';

type Point = { x: number; y: number };
type Stroke = {
  id: string;
  points: Point[];
  color: string;
  width: number;
};
type RectNode = {
  id: string;
  type: 'image' | 'youtube' | 'page' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  data: string;
  color?: string;
  fontSize?: number;
};

type Edge = {
  id: string;
  fromNodeId: string;
  fromSide?: 'top' | 'bottom' | 'left' | 'right';
  toNodeId: string;
  toSide?: 'top' | 'bottom' | 'left' | 'right';
};

type BoardData = {
  strokes: Stroke[];
  nodes?: RectNode[];
  edges?: Edge[];
};

export default function InfiniteBoard({ 
  content, 
  updateContent,
  notes,
  activateNote
}: { 
  content: string, 
  updateContent: (c: string) => void,
  notes: Note[],
  activateNote: (id: string | null, fallbackTitle?: string) => void
}) {
  const [data, setData] = useState<BoardData>({ strokes: [], nodes: [] });
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Initialize from saved content once when content loads
  useEffect(() => {
    try {
      if (content && content.trim() !== "") {
        setData(JSON.parse(content));
      }
    } catch (e) {
      console.warn("Failed to parse board data", e);
    }
  }, [content]);

  // Camera State
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  // Toolbar state
  const [tool, setTool] = useState<'select' | 'pan' | 'pen' | 'eraser' | 'text' | 'arrow'>('select');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentWidth, setCurrentWidth] = useState(4);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState('#ffffff');
  const [currentTextSize, setCurrentTextSize] = useState(24);
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ fromNodeId: string; fromSide: 'top' | 'bottom' | 'left' | 'right'; toX: number; toY: number } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);

  // Selection & Object manipulation
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interactiveNodeId, setInteractiveNodeId] = useState<string | null>(null);
  const [activeNodeAction, setActiveNodeAction] = useState<{
      id: string; action: 'drag' | 'resize';
      startX: number; startY: number;
      startNodeX: number; startNodeY: number;
      startNodeW: number; startNodeH: number;
  } | null>(null);

  // History State
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const actionStartStateStr = useRef<string | null>(null);

  const saveToHistory = (previousDataStr: string) => {
    setUndoStack(prev => [...prev.slice(-29), previousDataStr]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevStr = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, JSON.stringify(dataRef.current)]);
    const prevData = JSON.parse(prevStr);
    setData(prevData);
    updateContent(prevStr);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStr = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, JSON.stringify(dataRef.current)]);
    const nextData = JSON.parse(nextStr);
    setData(nextData);
    updateContent(nextStr);
  };

  const handleDelete = () => {
    if (selectedStrokeId) {
      saveToHistory(JSON.stringify(dataRef.current));
      const newData = { ...dataRef.current, strokes: dataRef.current.strokes.filter(s => s.id !== selectedStrokeId) };
      setData(newData);
      updateContent(JSON.stringify(newData));
      setSelectedStrokeId(null);
      return;
    }
    if (selectedEdgeId) {
      saveToHistory(JSON.stringify(dataRef.current));
      const newData = { ...dataRef.current, edges: (dataRef.current.edges || []).filter(e => e.id !== selectedEdgeId) };
      setData(newData);
      updateContent(JSON.stringify(newData));
      setSelectedEdgeId(null);
      return;
    }
    if (selectedNodeId) {
      saveToHistory(JSON.stringify(dataRef.current));
      const newData = {
        strokes: dataRef.current.strokes,
        nodes: (dataRef.current.nodes || []).filter(n => n.id !== selectedNodeId),
        edges: (dataRef.current.edges || []).filter(e => e.fromNodeId !== selectedNodeId && e.toNodeId !== selectedNodeId),
      };
      setData(newData);
      updateContent(JSON.stringify(newData));
      setSelectedNodeId(null);
    }
  };

  // Used to register any history save if state was mutated during PointerDown/PointerMove -> PointerUp cycle
  const commitHistoryOnPointerUp = () => {
    const newDataStr = JSON.stringify(dataRef.current);
    if (actionStartStateStr.current && actionStartStateStr.current !== newDataStr) {
      saveToHistory(actionStartStateStr.current);
    }
    actionStartStateStr.current = null;
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const COLORS = [
    { id: 'white', hex: '#ffffff' },
    { id: 'red', hex: '#ff4b4b' },
    { id: 'green', hex: '#4bff5a' },
    { id: 'blue', hex: '#4b83ff' },
    { id: 'yellow', hex: '#ffeb3b' },
  ];

  const getCanvasPoint = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - camera.x) / camera.z,
      y: (e.clientY - rect.top - camera.y) / camera.z,
    };
  };

  // ── Dock-point helpers ────────────────────────────────────────────────────
  // Returns the canvas coordinates of a node's dock point on a given side
  const getDockPoint = (node: RectNode, side: 'top' | 'bottom' | 'left' | 'right') => {
    const w = node.width  || 300;
    const h = node.height || 100;
    if (side === 'top')    return { x: node.x + w / 2, y: node.y };
    if (side === 'bottom') return { x: node.x + w / 2, y: node.y + h };
    if (side === 'left')   return { x: node.x,         y: node.y + h / 2 };
    /* right */             return { x: node.x + w,    y: node.y + h / 2 };
  };

  // Returns which side of a node is nearest to canvas coords (px, py)
  const getNearestSide = (node: RectNode, px: number, py: number): 'top' | 'bottom' | 'left' | 'right' => {
    const w = node.width  || 300;
    const h = node.height || 100;
    const relX = px - (node.x + w / 2);
    const relY = py - (node.y + h / 2);
    if (Math.abs(relX) > Math.abs(relY)) return relX > 0 ? 'right' : 'left';
    return relY > 0 ? 'bottom' : 'top';
  };
  // ── Stroke hit-test helper ────────────────────────────────────────────────────
  const isNearStroke = (stroke: Stroke, px: number, py: number, threshold: number): boolean => {
    const pts = stroke.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x,   ay = pts[i].y;
      const bx = pts[i+1].x, by = pts[i+1].y;
      const dx = bx - ax,    dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const cx = ax + t * dx, cy = ay + t * dy;
      if (Math.hypot(px - cx, py - cy) < threshold) return true;
    }
    // Single-point stroke fallback
    if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y) < threshold;
    return false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedNodeId || selectedEdgeId || selectedStrokeId)) {
        handleDelete();
      }
      
      // Keyboard Undo/Redo Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
           handleRedo();
        } else {
           handleUndo(); // Note: we need to wrap handleUndo/Redo inside refs or use useCallback, better to let UI buttons handle this for simplicity right now.
        }
      }
    };
    
    const handlePaste = (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const items = e.clipboardData?.items;

      // ── 1) Image paste takes priority (handles files, screenshots, browser copy) ──
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const blob = items[i].getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = (event) => {
                 const dataUrl = event.target?.result as string;
                 const newNode: RectNode = {
                   id: crypto.randomUUID(), type: 'image', data: dataUrl,
                   x: -camera.x / camera.z + window.innerWidth / 2 / camera.z - 150,
                   y: -camera.y / camera.z + window.innerHeight / 2 / camera.z - 150,
                   width: 300, height: 300
                 };
                 saveToHistory(JSON.stringify(dataRef.current));
                 const newData = { strokes: dataRef.current.strokes, nodes: [...(dataRef.current.nodes || []), newNode] };
                 setData(newData);
                 updateContent(JSON.stringify(newData));
                 setTool('select');
                 setSelectedNodeId(newNode.id);
              };
              reader.readAsDataURL(blob);
              e.preventDefault();
              return;
            }
          }
        }
      }

      // ── 2) YouTube URL paste ──
      const pastedText = e.clipboardData?.getData('text');
      if (pastedText) {
        const yIds = pastedText.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (yIds && yIds[1]) {
          const newNode: RectNode = {
            id: crypto.randomUUID(), type: 'youtube', data: yIds[1],
            x: -camera.x / camera.z + window.innerWidth / 2 / camera.z - 200,
            y: -camera.y / camera.z + window.innerHeight / 2 / camera.z - 150,
            width: 400, height: 225
          };
          saveToHistory(JSON.stringify(dataRef.current));
          const newData = { strokes: dataRef.current.strokes, nodes: [...(dataRef.current.nodes || []), newNode] };
          setData(newData);
          updateContent(JSON.stringify(newData));
          setTool('select');
          setSelectedNodeId(newNode.id);
          e.preventDefault();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedEdgeId, selectedStrokeId, camera, updateContent]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Record history state on interaction start
    actionStartStateStr.current = JSON.stringify(dataRef.current);

    if ((tool === 'select' || tool === 'text' || tool === 'arrow') && e.button === 0) {
       setSelectedNodeId(null);
       setInteractiveNodeId(null);
       setEditingTextNodeId(null);
       setSelectedEdgeId(null);
       setSelectedStrokeId(null);
    }

    // Stroke hit detection in select mode (fires only when clicking canvas background)
    if (tool === 'select' && e.button === 0) {
      const pt = getCanvasPoint(e);
      const threshold = 8 / camera.z;
      const hit = dataRef.current.strokes.find(s => isNearStroke(s, pt.x, pt.y, threshold));
      if (hit) {
        setSelectedStrokeId(hit.id);
        return; // don't start pan/draw
      }
    }

    if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 && tool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([getCanvasPoint(e)]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 && tool === 'eraser') {
      setIsDrawing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Arrow edge drag: update preview line endpoint
    if (draggingEdge) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDraggingEdge(prev => prev ? {
        ...prev,
        toX: (e.clientX - rect.left - camera.x) / camera.z,
        toY: (e.clientY - rect.top - camera.y) / camera.z,
      } : null);
      return;
    }
    if (activeNodeAction) {
       const dx = (e.clientX - activeNodeAction.startX) / camera.z;
       const dy = (e.clientY - activeNodeAction.startY) / camera.z;
       
       setData(prev => {
         const newNodes = (prev.nodes || []).map(n => {
           if (n.id === activeNodeAction.id) {
              if (activeNodeAction.action === 'drag') {
                 return { ...n, x: activeNodeAction.startNodeX + dx, y: activeNodeAction.startNodeY + dy };
              } else if (activeNodeAction.action === 'resize') {
                 let newW = Math.max(50, activeNodeAction.startNodeW + dx);
                 let newH = Math.max(50, activeNodeAction.startNodeH + dy);
                 
                 // Lock YouTube nodes to 16:9 aspect ratio
                 if (n.type === 'youtube') {
                    newH = newW * (9 / 16);
                 }
                 
                 return { ...n, width: newW, height: newH };
              }
           }
           return n;
         });
         return { ...prev, nodes: newNodes };
       });
       return;
    }

    if (isPanning) {
      setCamera(c => ({
        ...c,
        x: c.x + e.movementX,
        y: c.y + e.movementY
      }));
      return;
    }

    if (isDrawing && tool === 'pen') {
      setCurrentStroke(prev => [...prev, getCanvasPoint(e)]);
      return;
    }

    if (isDrawing && tool === 'eraser') {
      const p = getCanvasPoint(e);
      const eraseRadius = 20 / camera.z;
      const newStrokes = data.strokes.filter(stroke => {
        const isHit = stroke.points.some(
          sp => Math.hypot(sp.x - p.x, sp.y - p.y) < eraseRadius
        );
        return !isHit;
      });
      if (newStrokes.length !== data.strokes.length) {
        const newData = { ...dataRef.current, strokes: newStrokes };
        setData(newData);
        updateContent(JSON.stringify(newData));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // Arrow edge drop: check if landing on a node
    if (draggingEdge) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dropX = (e.clientX - rect.left - camera.x) / camera.z;
        const dropY = (e.clientY - rect.top - camera.y) / camera.z;
        const hitNode = (dataRef.current.nodes || []).find(n =>
          n.id !== draggingEdge.fromNodeId &&
          dropX >= n.x && dropX <= n.x + (n.width  || 300) &&
          dropY >= n.y && dropY <= n.y + (n.height || 100)
        );
        if (hitNode) {
          const toSide = getNearestSide(hitNode, dropX, dropY);
          const newEdge: Edge = {
            id: crypto.randomUUID(),
            fromNodeId: draggingEdge.fromNodeId,
            fromSide: draggingEdge.fromSide,
            toNodeId: hitNode.id,
            toSide,
          };
          saveToHistory(JSON.stringify(dataRef.current));
          const newData = { ...dataRef.current, edges: [...(dataRef.current.edges || []), newEdge] };
          setData(newData);
          updateContent(JSON.stringify(newData));
        }
      }
      setDraggingEdge(null);
      return;
    }
    if (activeNodeAction) {
       setActiveNodeAction(null);
       updateContent(JSON.stringify(dataRef.current));
       commitHistoryOnPointerUp();
       return;
    }

    if (isPanning) {
      setIsPanning(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      // Wait, panning doesn't mutate data, don't need history check
      return;
    }

    if (isDrawing && tool === 'pen') {
      setIsDrawing(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (currentStroke.length > 0) {
        const newStroke: Stroke = {
          id: crypto.randomUUID(),
          points: currentStroke,
          color: currentColor,
          width: currentWidth
        };
        const newData = { ...dataRef.current, strokes: [...dataRef.current.strokes, newStroke] };
        setData(newData);
        setCurrentStroke([]);
        updateContent(JSON.stringify(newData));
        commitHistoryOnPointerUp();
      }
      return;
    }

    if (isDrawing && tool === 'eraser') {
       setIsDrawing(false);
       (e.target as HTMLElement).releasePointerCapture(e.pointerId);
       commitHistoryOnPointerUp();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomFactor = -e.deltaY * 0.002;
    const newZ = Math.min(Math.max(camera.z * Math.exp(zoomFactor), 0.1), 10);
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - camera.x) * (newZ / camera.z);
    const newY = mouseY - (mouseY - camera.y) * (newZ / camera.z);

    setCamera({ x: newX, y: newY, z: newZ });
  };

  // Convert points to SVG SVGPathElement data string
  const renderStroke = (pts: Point[]) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  };

  const drawGrid = () => {
     return (
       <defs>
         <pattern id="dotGrid" width={40} height={40} patternUnits="userSpaceOnUse">
            <circle cx={20} cy={20} r={1.5} fill="#ffffff" opacity={0.1} />
         </pattern>
       </defs>
     );
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#0a0a0a] select-none">
      
      {/* Bottom Center Toolbar Container (Holding both primary and secondary panels) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
          
        {/* Primary Toolbar */}
        <div className="flex items-center p-2 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl gap-2">
          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'select' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => setTool('select')}
            title="選択・移動 (Select)"
          >
            <span className="text-xl">👆</span>
          </button>
          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'pan' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => setTool('pan')}
            title="パン操作 (Hand)"
          >
            <span className="text-xl">🖐</span>
          </button>

          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'pen' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => setTool('pen')}
            title="描画ツール"
          >
            <span className="text-xl">✏️</span>
          </button>

          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'eraser' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => setTool('eraser')}
            title="消しゴム"
          >
            <span className="text-xl">🧹</span>
          </button>

          <div className="w-[1px] h-8 bg-white/20 mx-1"></div>

          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'text' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => {
              setTool('text');
              const newNode: RectNode = {
                id: crypto.randomUUID(), type: 'text', data: '',
                x: -camera.x / camera.z + window.innerWidth / 2 / camera.z - 150, 
                y: -camera.y / camera.z + window.innerHeight / 2 / camera.z - 50,
                width: 300, height: 100,
                color: currentTextColor, fontSize: currentTextSize
              };
              saveToHistory(JSON.stringify(dataRef.current));
              const newData = { strokes: dataRef.current.strokes, nodes: [...(dataRef.current.nodes || []), newNode] };
              setData(newData);
              updateContent(JSON.stringify(newData));
              setSelectedNodeId(newNode.id);
              setEditingTextNodeId(newNode.id);
            }}
            title="テキスト"
          >
            <span className="text-xl">📝</span>
          </button>

          <button 
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${tool === 'arrow' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            onClick={() => setTool('arrow')}
            title="ノードを矢印で接続 (Arrow)"
          >
            <span className="text-lg font-bold">→</span>
          </button>
        </div>

        {/* History & Actions Toolbar (Attached to the right) */}
        <div className="flex items-center p-2 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl gap-2">
          <button 
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
            onClick={handleUndo} disabled={undoStack.length === 0} title="取り消し (Undo)"
          >
            <span className="text-lg">↩️</span>
          </button>
          <button 
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
            onClick={handleRedo} disabled={redoStack.length === 0} title="やり直し (Redo)"
          >
            <span className="text-lg">↪️</span>
          </button>
          
          <div className="w-[1px] h-6 bg-white/20 mx-1"></div>

          <button 
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all text-red-500/50 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-20 disabled:hover:bg-transparent"
            onClick={handleDelete} disabled={!selectedNodeId && !selectedEdgeId && !selectedStrokeId} title="選択消去 (Delete)"
          >
            <span className="text-lg">🗑️</span>
          </button>
        </div>

      </div>

      {/* ... previous remaining elements */}
      {/* Zoom indicator */}
      <div className="absolute bottom-8 left-8 z-50 bg-black/60 backdrop-blur rounded-lg border border-white/10 shadow-lg px-4 py-2 text-white/60 text-sm font-mono cursor-pointer hover:bg-white/10 transition-colors"
           onClick={() => setCamera({ x: 0, y: 0, z: 1 })}
           title="クリックでズーム・座標をリセット"
      >
          {Math.round(camera.z * 100)}%
      </div>

      {/* Top Right Tool Settings Dropdown */}
      {tool === 'pen' && (
        <div className="absolute top-20 right-6 z-50 flex flex-col bg-black/80 backdrop-blur-2xl shadow-2xl rounded-2xl border border-white/10 overflow-hidden w-[240px] transition-all duration-300">
           {/* Header / Toggle Button */}
           <button 
             onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
             className="w-full px-4 py-3 text-sm text-white/80 hover:text-white flex items-center justify-between transition-colors hover:bg-white/5 active:bg-white/10"
           >
             <span className="font-medium flex items-center gap-2 text-white"><span>🎨</span> ペン設定</span>
             <span className="text-[10px] text-white/50">{isStyleMenuOpen ? '▲' : '▼'}</span>
           </button>

           {/* Expandable Content Area */}
           <div className={`w-full flex flex-col transition-all duration-300 ease-in-out ${isStyleMenuOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
             <div className="p-4 pt-1 flex flex-col gap-4">
                {/* Colors */}
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-3">Color</div>
                  <div className="flex gap-2 justify-between">
                    {COLORS.map(c => (
                      <button 
                         key={c.id} 
                         onClick={() => setCurrentColor(c.hex)}
                         title={c.id}
                         className={`w-7 h-7 rounded-full shadow-inner transition-transform ${currentColor === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'}`}
                         style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>

                {/* Separator */}
                <div className="w-full h-px bg-white/10"></div>

                {/* Thickness Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Thickness</div>
                    <div className="text-[10px] font-mono text-white/60">{currentWidth}px</div>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="32" 
                    value={currentWidth}
                    onChange={(e) => setCurrentWidth(parseInt(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer mb-2"
                  />
                  {/* Visual preview of thickness */}
                  <div className="mt-2 flex items-center justify-center py-2 bg-white/5 rounded-lg border border-white/5 overflow-hidden min-h-[48px]">
                     <div className="rounded-full shadow-lg" style={{ width: currentWidth, height: currentWidth, backgroundColor: currentColor }}></div>
                  </div>
                </div>
             </div>
           </div>
        </div>
      )}

      {/* Top Right Text Settings Dropdown */}
      {tool === 'text' && (
        <div className="absolute top-20 right-6 z-50 flex flex-col bg-black/80 backdrop-blur-2xl shadow-2xl rounded-2xl border border-white/10 overflow-hidden w-[240px] transition-all duration-300">
           {/* Header / Toggle Button */}
           <button 
             onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
             className="w-full px-4 py-3 text-sm text-white/80 hover:text-white flex items-center justify-between transition-colors hover:bg-white/5 active:bg-white/10"
           >
             <span className="font-medium flex items-center gap-2 text-white"><span>📝</span> テキスト設定</span>
             <span className="text-[10px] text-white/50">{isStyleMenuOpen ? '▲' : '▼'}</span>
           </button>

           {/* Expandable Content Area */}
           <div className={`w-full flex flex-col transition-all duration-300 ease-in-out ${isStyleMenuOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
             <div className="p-4 pt-1 flex flex-col gap-4">
                {/* Colors */}
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-3">Color</div>
                  <div className="flex gap-2 justify-between">
                    {COLORS.map(c => (
                      <button 
                         key={c.id} 
                         onClick={() => {
                           setCurrentTextColor(c.hex);
                           if (selectedNodeId) {
                             const newNodes = dataRef.current.nodes?.map(n =>
                               n.id === selectedNodeId && n.type === 'text' ? { ...n, color: c.hex } : n
                             );
                             const newData = { ...dataRef.current, nodes: newNodes };
                             setData(newData);
                             updateContent(JSON.stringify(newData));
                           }
                         }}
                         title={c.id}
                         className={`w-7 h-7 rounded-full shadow-inner transition-transform ${currentTextColor === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'}`}
                         style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>

                {/* Separator */}
                <div className="w-full h-px bg-white/10"></div>

                {/* Size Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Size</div>
                    <div className="text-[10px] font-mono text-white/60">{currentTextSize}px</div>
                  </div>
                  <input 
                    type="range" 
                    min="12" 
                    max="120" 
                    value={currentTextSize}
                    onChange={(e) => {
                      const newSize = parseInt(e.target.value);
                      setCurrentTextSize(newSize);
                      if (selectedNodeId) {
                        const newNodes = dataRef.current.nodes?.map(n =>
                          n.id === selectedNodeId && n.type === 'text' ? { ...n, fontSize: newSize } : n
                        );
                        const newData = { ...dataRef.current, nodes: newNodes };
                        setData(newData);
                        updateContent(JSON.stringify(newData));
                      }
                    }}
                    className="w-full accent-blue-500 cursor-pointer mb-2"
                  />
                </div>
             </div>
           </div>
        </div>
      )}

      {/* Viewport for Infinite Canvas */}
      <div 
        ref={containerRef}
        className="absolute inset-0 touch-none w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const noteId = e.dataTransfer.getData("application/nemo-note-id");
          if (noteId) {
             const rect = containerRef.current?.getBoundingClientRect();
             if (!rect) return;
             const dropX = (e.clientX - rect.left - camera.x) / camera.z;
             const dropY = (e.clientY - rect.top - camera.y) / camera.z;
             
             const newNode: RectNode = {
               id: crypto.randomUUID(), type: 'page', data: noteId,
               x: dropX - 125, y: dropY - 90, width: 250, height: 180
             };
             saveToHistory(JSON.stringify(dataRef.current));
             const newData = { strokes: dataRef.current.strokes, nodes: [...(dataRef.current.nodes || []), newNode] };
             setData(newData);
             updateContent(JSON.stringify(newData));
             setTool('select');
             setSelectedNodeId(newNode.id);
          }
        }}
        style={{
          cursor: tool === 'pan' || isPanning ? 'grab' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : tool === 'arrow' ? 'crosshair' : tool === 'select' ? 'default' : 'crosshair'
        }}
      >
        <svg 
            width="100%" 
            height="100%" 
            className="absolute inset-0 pointer-events-none"
        >
           {drawGrid()}
           <rect width="100%" height="100%" fill="url(#dotGrid)" 
                style={{
                  transform: `translate(${camera.x % (40 * camera.z)}px, ${camera.y % (40 * camera.z)}px) scale(${camera.z})`,
                  transformOrigin: '0 0'
                }}
           />
        </svg>

        <div 
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%'
          }}
          className="pointer-events-none absolute inset-0"
        >
          {/* ----- HTML Node Overlay (Images, Videos) ----- */}
          {(data.nodes || []).map(node => (
             <div 
               key={node.id}
               className={`absolute group box-border ${
                 selectedNodeId === node.id
                   ? node.type === 'text' ? 'outline outline-2 outline-blue-500 z-20' : 'ring-2 ring-blue-500 shadow-xl z-20'
                   : 'shadow-md z-10'
               }`}
               style={{
                 left: node.x, top: node.y,
                 width: node.type === 'text' ? 'max-content' : node.width,
                 height: node.type === 'text' ? 'auto' : node.height,
                 maxWidth: node.type === 'text' ? '600px' : undefined,
                 cursor: tool === 'arrow' ? 'crosshair' : (tool === 'select' || (tool === 'text' && node.type === 'text')) ? 'move' : 'default',
                 pointerEvents: (tool === 'select' || tool === 'arrow' || (tool === 'text' && node.type === 'text')) ? 'auto' : 'none',
               }}
               onPointerDown={(e) => {
                 actionStartStateStr.current = JSON.stringify(dataRef.current);
                 // Arrow tool: edges start only from dock points — block body click
                 if (tool === 'arrow') {
                   e.stopPropagation();
                   return;
                 }
                 if (tool !== 'select') return;
                 e.stopPropagation();
                 setSelectedNodeId(node.id);
                 setActiveNodeAction({
                    id: node.id, action: 'drag',
                    startX: e.clientX, startY: e.clientY,
                    startNodeX: node.x, startNodeY: node.y,
                    startNodeW: node.width, startNodeH: node.height
                 });
               }}
             >
               {/* Arrow tool: 4 dock-point circles at the node edges */}
               {tool === 'arrow' && (['top', 'bottom', 'left', 'right'] as const).map(side => {
                 const pos: React.CSSProperties =
                   side === 'top'    ? { top: -6,    left: '50%', transform: 'translateX(-50%)' } :
                   side === 'bottom' ? { bottom: -6, left: '50%', transform: 'translateX(-50%)' } :
                   side === 'left'   ? { left: -6,   top: '50%',  transform: 'translateY(-50%)' } :
                                       { right: -6,  top: '50%',  transform: 'translateY(-50%)' };
                 return (
                   <div
                     key={side}
                     className="absolute w-3 h-3 rounded-full bg-white border-2 border-blue-400 z-40 hover:scale-150 hover:bg-blue-400 transition-transform"
                     style={{ ...pos, pointerEvents: 'auto', cursor: 'crosshair' }}
                     onPointerDown={(e) => {
                       e.stopPropagation();
                       (e.target as HTMLElement).setPointerCapture(e.pointerId);
                       const dp = getDockPoint(node, side);
                       setDraggingEdge({ fromNodeId: node.id, fromSide: side, toX: dp.x, toY: dp.y });
                     }}
                   />
                 );
               })}
               {node.type === 'image' && (
                 <img src={node.data} alt="Canvas Node" className="w-full h-full object-contain rounded-sm pointer-events-none" draggable={false} />
               )}
               {node.type === 'youtube' && (
                 <div className="w-full h-full relative rounded-sm overflow-hidden bg-black/50">
                    <iframe 
                       width="100%" height="100%" 
                       src={`https://www.youtube.com/embed/${node.data}`} 
                       title="YouTube" frameBorder="0" 
                       allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                    ></iframe>
                    {/* The Interactive Overlay to prevent iframe from stealing mouse events. Double click to interact. */}
                    {interactiveNodeId !== node.id && (
                       <div 
                         className="absolute inset-0 z-10 block bg-transparent"
                         onDoubleClick={(e) => {
                            e.stopPropagation();
                            setInteractiveNodeId(node.id);
                         }}
                         title="ダブルクリックで動画を操作"
                       ></div>
                    )}
                 </div>
               )}

               {node.type === 'page' && (() => {
                 const targetNote = notes.find(n => n.id === node.data);
                 if (!targetNote) return <div className="w-full h-full bg-red-900/50 flex items-center justify-center text-white/50 text-xs text-center p-2 rounded-sm">ノートが見つかりません</div>;
                 
                 const yIds = extractYouTubeIds(targetNote.content);
                 const hasYoutube = yIds.length > 0;
                 
                 return (
                   <div 
                     className="w-full h-full bg-[#0a0a0a] border border-white/20 rounded-xl p-4 flex flex-col shadow-2xl overflow-hidden hover:border-white/40 transition-colors pointer-events-auto"
                     onDoubleClick={(e) => {
                        e.stopPropagation();
                        activateNote(targetNote.id, targetNote.title);
                     }}
                     title="ダブルクリックでページを開く"
                   >
                     <h3 className="font-semibold text-white mb-2 truncate flex-shrink-0" style={{ fontSize: Math.max(12, Math.min(node.width * 0.08, 24)) }}>
                       {targetNote.title || "無題"}
                     </h3>
                     {hasYoutube && (
                       <div className="mb-2 rounded-md overflow-hidden border border-white/5 flex-shrink-0 relative" style={{ height: Math.min(node.height * 0.4, 150) }}>
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src={`https://img.youtube.com/vi/${yIds[0]}/mqdefault.jpg`} alt="YouTube preview" className="w-full h-full object-cover opacity-80" draggable={false} />
                         <div className="absolute inset-0 flex items-center justify-center text-[10px]">
                           <div className="bg-red-600 text-white rounded w-8 h-5 flex items-center justify-center bg-opacity-80">▶</div>
                         </div>
                       </div>
                     )}
                     <p className="text-white/50 text-xs flex-1 overflow-hidden whitespace-pre-wrap leading-relaxed" 
                        style={{ fontSize: Math.max(10, Math.min(node.width * 0.05, 14)), maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
                       {targetNote.content}
                     </p>
                   </div>
                 );
               })()}

               {node.type === 'text' && (
                  <div 
                    className="relative"
                    onDoubleClick={(e) => {
                       e.stopPropagation();
                       setEditingTextNodeId(node.id);
                       setTool('text');
                    }}
                    onPointerDown={(e) => {
                       if (tool === 'text' && node.type === 'text') {
                         actionStartStateStr.current = JSON.stringify(dataRef.current);
                         e.stopPropagation();
                         setSelectedNodeId(node.id);
                         setActiveNodeAction({
                           id: node.id, action: 'drag',
                           startX: e.clientX, startY: e.clientY,
                           startNodeX: node.x, startNodeY: node.y,
                           startNodeW: node.width, startNodeH: node.height
                         });
                       }
                    }}
                  >
                    {editingTextNodeId === node.id ? (
                      <textarea
                        autoFocus
                        className="block bg-transparent border-none outline-none resize-none leading-relaxed overflow-hidden"
                        style={{
                          color: node.color || '#ffffff',
                          fontSize: `${node.fontSize || 24}px`,
                          width: '100%',
                          minWidth: '80px',
                          height: 'auto',
                          caretColor: node.color || '#ffffff',
                        }}
                        rows={1}
                        value={node.data}
                        onChange={(e) => {
                          const el = e.target;
                          el.style.height = 'auto';
                          el.style.height = el.scrollHeight + 'px';
                          const val = el.value;
                          const newNodes = dataRef.current.nodes?.map(n =>
                            n.id === node.id ? { ...n, data: val } : n
                          );
                          const newData = { ...dataRef.current, nodes: newNodes };
                          setData(newData);
                        }}
                        onBlur={() => {
                          updateContent(JSON.stringify(dataRef.current));
                          setEditingTextNodeId(null);
                        }}
                        onPointerDown={e => e.stopPropagation()}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                          }
                        }}
                      />
                    ) : (
                      <div 
                        className="whitespace-pre-wrap break-words leading-relaxed cursor-text select-none"
                        style={{
                          color: node.color || '#ffffff',
                          fontSize: `${node.fontSize || 24}px`,
                          minWidth: '80px',
                          minHeight: `${(node.fontSize || 24) * 1.5}px`,
                        }}
                      >
                        {node.data || <span className="opacity-20">Aa</span>}
                      </div>
                    )}
                  </div>
               )}

               {/* Resize Handle - text nodes auto-size so no handle needed */}
               {selectedNodeId === node.id && node.type !== 'text' && tool === 'select' && (
                 <div 
                   className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full cursor-nwse-resize z-30 shadow-lg flex items-center justify-center pointer-events-auto hover:scale-125 transition-transform"
                   onPointerDown={(e) => {
                     e.stopPropagation();
                     actionStartStateStr.current = JSON.stringify(dataRef.current);
                     setActiveNodeAction({
                        id: node.id, action: 'resize',
                        startX: e.clientX, startY: e.clientY,
                        startNodeX: node.x, startNodeY: node.y,
                        startNodeW: node.width, startNodeH: node.height
                     });
                   }}
                 >
                   <div className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
                 </div>
               )}
             </div>
          ))}

          {/* ----- SVG Strokes ----- */}
          <svg className="overflow-visible absolute inset-0 w-full h-full">
            {/* Draw existing strokes */}
            {data.strokes.map(s => {
              const isSelected = selectedStrokeId === s.id;
              const d = renderStroke(s.points);
              return (
                <g key={s.id}>
                  {/* Wide invisible hit area for click selection */}
                  <path
                    d={d}
                    stroke="transparent"
                    strokeWidth={Math.max(s.width + 12, 16)}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: tool === 'select' ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      if (tool !== 'select') return;
                      e.stopPropagation();
                      setSelectedStrokeId(isSelected ? null : s.id);
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    }}
                  />
                  {/* Glow / selection highlight */}
                  {isSelected && (
                    <path
                      d={d}
                      stroke="rgba(59,130,246,0.5)"
                      strokeWidth={s.width + 8}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {/* Actual stroke */}
                  <path
                    d={d}
                    stroke={s.color}
                    strokeWidth={s.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}
            
            {/* Current drawing stroke live preview */}
            {currentStroke.length > 0 && (
              <path 
                d={renderStroke(currentStroke)} 
                stroke={currentColor} 
                strokeWidth={currentWidth} 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            )}
          </svg>

          {/* ----- Edges (Arrows between nodes) ----- */}
          <svg className="overflow-visible absolute inset-0 w-full h-full" style={{ zIndex: 25 }}>
            <defs>
              <marker id="arrowNorm" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="rgba(148,163,184,0.65)" />
              </marker>
              <marker id="arrowSel" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="rgb(59,130,246)" />
              </marker>
              <marker id="arrowPrev" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="rgba(59,130,246,0.7)" />
              </marker>
            </defs>

            {/* Completed edges */}
            {(data.edges || []).map(edge => {
              const fromNode = (data.nodes || []).find(n => n.id === edge.fromNodeId);
              const toNode   = (data.nodes || []).find(n => n.id === edge.toNodeId);
              if (!fromNode || !toNode) return null;
              const fromPt = getDockPoint(fromNode, edge.fromSide || 'right');
              const toPt   = getDockPoint(toNode,   edge.toSide   || 'left');
              const fx = fromPt.x, fy = fromPt.y;
              const tx = toPt.x,   ty = toPt.y;
              const isSel = selectedEdgeId === edge.id;
              return (
                <g key={edge.id}>
                  {/* Wide transparent hit area */}
                  <line x1={fx} y1={fy} x2={tx} y2={ty}
                    stroke="transparent" strokeWidth={18}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(isSel ? null : edge.id); setSelectedNodeId(null); }}
                  />
                  {/* Visible arrow */}
                  <line x1={fx} y1={fy} x2={tx} y2={ty}
                    stroke={isSel ? 'rgba(59,130,246,0.95)' : 'rgba(148,163,184,0.5)'}
                    strokeWidth={isSel ? 2.5 : 1.5}
                    markerEnd={isSel ? 'url(#arrowSel)' : 'url(#arrowNorm)'}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Selection label for delete hint */}
                  {isSel && (
                    <text
                      x={(fx + tx) / 2} y={(fy + ty) / 2 - 8}
                      fill="rgba(59,130,246,0.8)" fontSize="10" textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      Delete で削除
                    </text>
                  )}
                </g>
              );
            })}

            {/* Dragging edge preview */}
            {draggingEdge && (() => {
              const fromNode = (data.nodes || []).find(n => n.id === draggingEdge.fromNodeId);
              if (!fromNode) return null;
              const fromPt = getDockPoint(fromNode, draggingEdge.fromSide);
              return (
                <line x1={fromPt.x} y1={fromPt.y} x2={draggingEdge.toX} y2={draggingEdge.toY}
                  stroke="rgba(59,130,246,0.7)" strokeWidth={1.5}
                  strokeDasharray="7,4" markerEnd="url(#arrowPrev)"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })()}
          </svg>

        </div>
      </div>
    </div>
  );
}
