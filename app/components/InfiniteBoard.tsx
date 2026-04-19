"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Note } from '../types';
import { extractYouTubeIds } from '../lib/utils';
import {
  Point, Side, HandleDir, ToolType,
  Stroke, RectNode, Edge, BoardData, COLORS,
} from './board/types';

// ─────────────────────────────────────────────────────────────────────────────
// 定数・ヘルパー関数
// ─────────────────────────────────────────────────────────────────────────────

const GRID_SIZE = 20;

/** Chaikin アルゴリズムでストロークを平滑化 */
function smoothStroke(pts: Point[], iterations = 2): Point[] {
  if (pts.length < 3) return pts;
  let result = pts;
  for (let i = 0; i < iterations; i++) {
    const next: Point[] = [result[0]];
    for (let j = 0; j < result.length - 1; j++) {
      const p0 = result[j], p1 = result[j + 1];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

/** Quadratic Bezier 中間点補間でSVGパスを生成 */
function renderStroke(pts: Point[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
}

/** ノードのドックポイント（接続点）を返す */
function getDockPoint(node: RectNode, side: Side): Point {
  const w = node.width  || 300;
  const h = node.height || 100;
  if (side === 'top')    return { x: node.x + w / 2, y: node.y };
  if (side === 'bottom') return { x: node.x + w / 2, y: node.y + h };
  if (side === 'left')   return { x: node.x,         y: node.y + h / 2 };
  /* right */             return { x: node.x + w,    y: node.y + h / 2 };
}

/** 指定座標に最も近いノードの側面を返す */
function getNearestSide(node: RectNode, px: number, py: number): Side {
  const w = node.width  || 300;
  const h = node.height || 100;
  const relX = px - (node.x + w / 2);
  const relY = py - (node.y + h / 2);
  if (Math.abs(relX) > Math.abs(relY)) return relX > 0 ? 'right' : 'left';
  return relY > 0 ? 'bottom' : 'top';
}

/** Bezier エッジの制御点を返す（カスタムまたは自動計算） */
function getEdgeCPs(
  fromPt: Point, fromSide: Side,
  toPt:   Point, toSide: Side,
  custom?: { cp1?: Point; cp2?: Point }
): { cp1: Point; cp2: Point } {
  const dist   = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y);
  const offset = Math.max(60, dist * 0.4);
  const offsets: Record<Side, Point> = {
    right:  { x: offset, y: 0 },
    left:   { x: -offset, y: 0 },
    bottom: { x: 0, y: offset },
    top:    { x: 0, y: -offset },
  };
  return {
    cp1: custom?.cp1 ?? { x: fromPt.x + offsets[fromSide].x, y: fromPt.y + offsets[fromSide].y },
    cp2: custom?.cp2 ?? { x: toPt.x   + offsets[toSide].x,   y: toPt.y   + offsets[toSide].y },
  };
}

/** ストロークのヒット判定 */
function isNearStroke(stroke: Stroke, px: number, py: number, threshold: number): boolean {
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
  if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y) < threshold;
  return false;
}

/** 座標のスナップ (GRID_SIZE刻み) */
function snap(val: number, isEnabled: boolean, gridSize = GRID_SIZE): number {
  return isEnabled ? Math.round(val / gridSize) * gridSize : val;
}

/** 矩形同士の交差判定 */
function intersectRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 矩形とストロークの交差判定 */
function intersectStroke(r: { x: number; y: number; w: number; h: number }, s: Stroke): boolean {
  return s.points.some(p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

// ─────────────────────────────────────────────────────────────────────────────
// ToolBtn
// ─────────────────────────────────────────────────────────────────────────────
const ToolBtn = ({
  isActive, title, onClick, children,
}: {
  isActive: boolean; title: string; onClick: () => void; children: React.ReactNode;
}) => (
  <button
    className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${
      isActive
        ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
        : 'text-white/60 hover:bg-white/10 hover:text-white'
    }`}
    onClick={onClick}
    title={title}
  >
    {children}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// ドットグリッド
// ─────────────────────────────────────────────────────────────────────────────
const drawGrid = () => (
  <defs>
    <pattern id="dotGrid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
      <circle cx={0} cy={0} r={1.5} fill="#ffffff" opacity={0.1} />
    </pattern>
  </defs>
);

// ─────────────────────────────────────────────────────────────────────────────
// 8方向リサイズハンドルの定義
// ─────────────────────────────────────────────────────────────────────────────
const RESIZE_HANDLES: Array<{ dir: HandleDir; cursor: string; style: React.CSSProperties }> = [
  { dir: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5 } },
  { dir: 'n',  cursor: 'ns-resize',   style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5 } },
  { dir: 'e',  cursor: 'ew-resize',   style: { top: '50%', right: -5, transform: 'translateY(-50%)' } },
  { dir: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
  { dir: 's',  cursor: 'ns-resize',   style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5 } },
  { dir: 'w',  cursor: 'ew-resize',   style: { top: '50%', left: -5, transform: 'translateY(-50%)' } },
];

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────
export default function InfiniteBoard({
  content,
  updateContent,
  notes,
  activateNote
}: {
  content: string;
  updateContent: (c: string) => void;
  notes: Note[];
  activateNote: (id: string | null, fallbackTitle?: string) => void;
}) {
  // ── データ ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<BoardData>({ strokes: [], nodes: [], edges: [] });
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // 保存済みデータの初期ロード
  useEffect(() => {
    try {
      if (content && content.trim() !== '') {
        const parsed = JSON.parse(content) as BoardData;
        // 欠けているフィールドを補完
        setData({
          strokes: parsed.strokes || [],
          nodes:   parsed.nodes   || [],
          edges:   parsed.edges   || [],
          groups:  parsed.groups  || [],
        });
      }
    } catch (e) {
      console.warn('Failed to parse board data', e);
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── カメラ ──────────────────────────────────────────────────────────────────
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // ── 描画状態 ────────────────────────────────────────────────────────────────
  const [isPanning, setIsPanning]         = useState(false);
  const [isDrawing, setIsDrawing]         = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  // ── ツール状態 ──────────────────────────────────────────────────────────────
  const [tool,                    setTool]                    = useState<ToolType>('select');
  const [currentColor,            setCurrentColor]            = useState('#ffffff');
  const [currentWidth,            setCurrentWidth]            = useState(4);
  const [isStyleMenuOpen,         setIsStyleMenuOpen]         = useState(false);
  const [currentTextColor,        setCurrentTextColor]        = useState('#ffffff');
  const [currentTextSize,         setCurrentTextSize]         = useState(24);
  const [currentFillColor,        setCurrentFillColor]        = useState<string>('transparent');
  const [currentShapeStrokeWidth, setCurrentShapeStrokeWidth] = useState<number>(2);

  // ── 編集状態 ────────────────────────────────────────────────────────────────
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(null);
  const [interactiveNodeId, setInteractiveNodeId] = useState<string | null>(null);

  // ── 選択・相互作用 ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSnapToGrid, setIsSnapToGrid] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetId?: string, type?: 'node' | 'edge' | 'stroke' | 'canvas' } | null>(null);

  // ── マーキー選択 ────────────────────────────────────────────────────────────
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeEnd,   setMarqueeEnd]   = useState<Point | null>(null);

  // ── エッジドラッグ / CP ドラッグ ──────────────────────────────────────────
  const [draggingEdge, setDraggingEdge] = useState<{
    fromNodeId: string; fromSide: Side; toX: number; toY: number;
  } | null>(null);
  const [draggingCP, setDraggingCP] = useState<{ edgeId: string; which: 'cp1' | 'cp2' } | null>(null);

  // ── 図形描画 ────────────────────────────────────────────────────────────────
  const [shapeStartPt, setShapeStartPt] = useState<Point | null>(null);
  const [shapeCurPt,   setShapeCurPt]   = useState<Point | null>(null);

  // ── アクション（drag / resize） ──────────────────────────────────────────
  const [activeNodeAction, setActiveNodeAction] = useState<{
    ids: string[]; action: 'drag' | 'resize'; handle?: HandleDir;
    startX: number; startY: number;
    startStates: Record<string, any>;
  } | null>(null);

  // ── Undo/Redo ──────────────────────────────────────────────────────────────
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [undoLen, setUndoLen] = useState(0); 
  const [redoLen, setRedoLen] = useState(0);
  const actionStartStateStr = useRef<string | null>(null);

  const saveToHistory = useCallback((previousDataStr: string) => {
    undoStackRef.current = [...undoStackRef.current.slice(-29), previousDataStr];
    redoStackRef.current = [];
    setUndoLen(undoStackRef.current.length);
    setRedoLen(0);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    const prevStr = undoStackRef.current.pop()!;
    redoStackRef.current.push(JSON.stringify(dataRef.current));
    setUndoLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    const prevData = JSON.parse(prevStr) as BoardData;
    setData(prevData);
    dataRef.current = prevData;
    updateContent(prevStr);
  }, [updateContent]);

  const handleRedo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    const nextStr = redoStackRef.current.pop()!;
    undoStackRef.current.push(JSON.stringify(dataRef.current));
    setUndoLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    const nextData = JSON.parse(nextStr) as BoardData;
    setData(nextData);
    dataRef.current = nextData;
    updateContent(nextStr);
  }, [updateContent]);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    saveToHistory(JSON.stringify(dataRef.current));
    
    const nd = {
      strokes: dataRef.current.strokes.filter(s => !selectedIds.has(s.id)),
      nodes:   (dataRef.current.nodes || []).filter(n => !selectedIds.has(n.id)),
      edges:   (dataRef.current.edges || []).filter(e => 
        !selectedIds.has(e.id) && !selectedIds.has(e.fromNodeId) && !selectedIds.has(e.toNodeId)
      ),
      groups: dataRef.current.groups,
    };
    setData(nd); 
    updateContent(JSON.stringify(nd)); 
    setSelectedIds(new Set());
  }, [selectedIds, saveToHistory, updateContent]);

  const commitHistoryOnPointerUp = useCallback(() => {
    const newStr = JSON.stringify(dataRef.current);
    if (actionStartStateStr.current && actionStartStateStr.current !== newStr) {
      saveToHistory(actionStartStateStr.current);
    }
    actionStartStateStr.current = null;
  }, [saveToHistory]);

  // ── グループ・選択ヘルパー ──────────────────────────────────────────────────
  const getGroupIds = useCallback((id: string): string[] => {
    const node = (dataRef.current.nodes || []).find(n => n.id === id);
    const stroke = dataRef.current.strokes.find(s => s.id === id);
    const edge = (dataRef.current.edges || []).find(e => e.id === id);
    const groupId = node?.groupId || stroke?.groupId || edge?.groupId;
    if (!groupId) return [id];
    
    const members: string[] = [];
    (dataRef.current.nodes || []).forEach(n => { if (n.groupId === groupId) members.push(n.id); });
    dataRef.current.strokes.forEach(s => { if (s.groupId === groupId) members.push(s.id); });
    (dataRef.current.edges || []).forEach(e => { if (e.groupId === groupId) members.push(e.id); });
    return members.length > 0 ? members : [id];
  }, []);

  const selectItem = useCallback((id: string, shiftKey: boolean) => {
    const ids = getGroupIds(id);
    setSelectedIds(prev => {
      const next = new Set(shiftKey ? prev : []);
      const alreadySelected = ids.every(i => prev.has(i));
      if (shiftKey && alreadySelected) {
        ids.forEach(i => next.delete(i));
      } else {
        ids.forEach(i => next.add(i));
      }
      return next;
    });
  }, [getGroupIds]);

  // ── パッチヘルパー ──────────────────────────────────────────────────────────
  const patchSelected = useCallback((updates: { 
    node?: Partial<RectNode>, 
    stroke?: Partial<Stroke>, 
    edge?: Partial<Edge> 
  }) => {
    const nd = {
      ...dataRef.current,
      nodes: (dataRef.current.nodes || []).map(n => 
        selectedIds.has(n.id) && updates.node ? { ...n, ...updates.node } : n
      ),
      strokes: dataRef.current.strokes.map(s => 
        selectedIds.has(s.id) && updates.stroke ? { ...s, ...updates.stroke } : s
      ),
      edges: (dataRef.current.edges || []).map(e => 
        selectedIds.has(e.id) && updates.edge ? { ...e, ...updates.edge } : e
      ),
    };
    setData(nd); updateContent(JSON.stringify(nd));
  }, [selectedIds, updateContent]);

  const patchNode = useCallback((updates: Partial<RectNode>) => {
    const nd = {
      ...dataRef.current,
      nodes: (dataRef.current.nodes || []).map(n => 
        selectedIds.has(n.id) ? { ...n, ...updates } : n
      )
    };
    setData(nd); updateContent(JSON.stringify(nd));
  }, [selectedIds, updateContent]);

  const patchStroke = useCallback((updates: Partial<Stroke>) => {
    const nd = {
      ...dataRef.current,
      strokes: dataRef.current.strokes.map(s => 
        selectedIds.has(s.id) ? { ...s, ...updates } : s
      )
    };
    setData(nd); updateContent(JSON.stringify(nd));
  }, [selectedIds, updateContent]);

  const patchEdge = useCallback((updates: Partial<Edge>) => {
    const nd = {
      ...dataRef.current,
      edges: (dataRef.current.edges || []).map(e => 
        selectedIds.has(e.id) ? { ...e, ...updates } : e
      )
    };
    setData(nd); updateContent(JSON.stringify(nd));
  }, [selectedIds, updateContent]);

  // ── コンテキストメニューアクション ──────────────────────────────────────────
  const duplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    saveToHistory(JSON.stringify(dataRef.current));
    
    // ID変換マップ生成 (エッジの接続先更新用)
    const idMap: Record<string, string> = {};
    selectedIds.forEach(id => { idMap[id] = crypto.randomUUID(); });

    const offset = 40;
    const newNodes = (dataRef.current.nodes || [])
      .filter(n => selectedIds.has(n.id))
      .map(n => ({ ...n, id: idMap[n.id], x: n.x + offset, y: n.y + offset }));
    
    const newStrokes = dataRef.current.strokes
      .filter(s => selectedIds.has(s.id))
      .map(s => ({ ...s, id: idMap[s.id], points: s.points.map(p => ({ x: p.x + offset, y: p.y + offset })) }));

    const newEdges = (dataRef.current.edges || [])
      .filter(e => selectedIds.has(e.id) || (selectedIds.has(e.fromNodeId) && selectedIds.has(e.toNodeId)))
      .map(e => ({
        ...e,
        id: crypto.randomUUID(),
        fromNodeId: idMap[e.fromNodeId] || e.fromNodeId,
        toNodeId: idMap[e.toNodeId] || e.toNodeId,
        cp1: e.cp1 ? { x: e.cp1.x + offset, y: e.cp1.y + offset } : undefined,
        cp2: e.cp2 ? { x: e.cp2.x + offset, y: e.cp2.y + offset } : undefined,
      }));

    const nd = {
      ...dataRef.current,
      nodes: [...(dataRef.current.nodes || []), ...newNodes],
      strokes: [...dataRef.current.strokes, ...newStrokes],
      edges: [...(dataRef.current.edges || []), ...newEdges],
    };
    setData(nd); updateContent(JSON.stringify(nd));
    setSelectedIds(new Set(Object.values(idMap)));
  }, [selectedIds, saveToHistory, updateContent]);

  const reorderSelected = useCallback((to: 'front' | 'back') => {
    if (selectedIds.size === 0) return;
    saveToHistory(JSON.stringify(dataRef.current));
    
    const nodes = [...(dataRef.current.nodes || [])];
    const selNodes = nodes.filter(n => selectedIds.has(n.id));
    const remNodes = nodes.filter(n => !selectedIds.has(n.id));
    
    const strokes = [...dataRef.current.strokes];
    const selStrokes = strokes.filter(s => selectedIds.has(s.id));
    const remStrokes = strokes.filter(s => !selectedIds.has(s.id));

    const nd = {
      ...dataRef.current,
      nodes: to === 'front' ? [...remNodes, ...selNodes] : [...selNodes, ...remNodes],
      strokes: to === 'front' ? [...remStrokes, ...selStrokes] : [...selStrokes, ...remStrokes],
    };
    setData(nd); updateContent(JSON.stringify(nd));
  }, [selectedIds, saveToHistory, updateContent]);

  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    saveToHistory(JSON.stringify(dataRef.current));
    const gid = crypto.randomUUID();
    patchSelected({
      node: { groupId: gid },
      stroke: { groupId: gid },
      edge: { groupId: gid }
    });
  }, [selectedIds, saveToHistory, patchSelected]);

  const ungroupSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    saveToHistory(JSON.stringify(dataRef.current));
    patchSelected({
      node: { groupId: undefined },
      stroke: { groupId: undefined },
      edge: { groupId: undefined }
    });
  }, [selectedIds, saveToHistory, patchSelected]);

  // ── Refs ────────────────────────────────────────────────────────────
  const handleUndoRef   = useRef(handleUndo);
  const handleRedoRef   = useRef(handleRedo);
  const handleDeleteRef = useRef(handleDelete);
  useEffect(() => { handleUndoRef.current   = handleUndo;   }, [handleUndo]);
  useEffect(() => { handleRedoRef.current   = handleRedo;   }, [handleRedo]);
  useEffect(() => { handleDeleteRef.current = handleDelete; }, [handleDelete]);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── キーボード / ペースト ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedoRef.current();
        else            handleUndoRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedoRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── 座標変換 ────────────────────────────────────────────────────────────────
  const getCanvasPoint = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - camera.x) / camera.z,
      y: (e.clientY - rect.top  - camera.y) / camera.z,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    actionStartStateStr.current = JSON.stringify(dataRef.current);
    setContextMenu(null);

    // CP ドラッグ中は canvas のハンドラを無視
    if (draggingCP) return;

    if ((tool === 'select' || tool === 'text' || tool === 'arrow') && e.button === 0) {
      if (!e.shiftKey) {
        setSelectedIds(new Set());
      }
      setInteractiveNodeId(null);
      setEditingTextNodeId(null);
    }

    // ストロークヒット検出（select モード）
    if (tool === 'select' && e.button === 0) {
      const pt = getCanvasPoint(e);
      const threshold = 8 / camera.z;
      const hit = dataRef.current.strokes.find(s => isNearStroke(s, pt.x, pt.y, threshold));
      if (hit) {
        selectItem(hit.id, e.shiftKey);
        // ドラッグ開始
        const ids = e.shiftKey ? [...selectedIds, ...getGroupIds(hit.id)] : getGroupIds(hit.id);
        const starts: Record<string, any> = {};
        dataRef.current.strokes.filter(s => ids.includes(s.id)).forEach(s => {
          starts[s.id] = { points: [...s.points] };
        });
        setActiveNodeAction({
          ids, action: 'drag', startX: e.clientX, startY: e.clientY, startStates: starts
        });
        return;
      }
    }

    // パン
    if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 空白地クリック -> マーキー開始 (select モードのみ)
    if (tool === 'select' && e.button === 0 && !e.altKey) {
      setIsMarqueeSelecting(true);
      const pt = getCanvasPoint(e);
      setMarqueeStart(pt);
      setMarqueeEnd(pt);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    // ペン
    if (e.button === 0 && tool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([getCanvasPoint(e)]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 消しゴム
    if (e.button === 0 && tool === 'eraser') {
      setIsDrawing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    // 図形描画
    if (e.button === 0 && (tool === 'rect' || tool === 'ellipse')) {
      setSelectedIds(new Set());
      const pt = getCanvasPoint(e);
      setShapeStartPt(pt); setShapeCurPt(pt);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // CP ドラッグ
    if (draggingCP) {
      const pt = getCanvasPoint(e);
      const newEdges = (dataRef.current.edges || []).map(edge => {
        if (edge.id !== draggingCP.edgeId) return edge;
        const fromNode = (dataRef.current.nodes || []).find(n => n.id === edge.fromNodeId);
        const toNode   = (dataRef.current.nodes || []).find(n => n.id === edge.toNodeId);
        if (!fromNode || !toNode) return edge;
        const fp = getDockPoint(fromNode, edge.fromSide || 'right');
        const tp = getDockPoint(toNode,   edge.toSide   || 'left');
        const { cp1: defCp1, cp2: defCp2 } = getEdgeCPs(fp, edge.fromSide || 'right', tp, edge.toSide || 'left', edge);
        if (draggingCP.which === 'cp1') return { ...edge, cp1: { x: pt.x, y: pt.y }, cp2: edge.cp2 ?? defCp2 };
        return { ...edge, cp1: edge.cp1 ?? defCp1, cp2: { x: pt.x, y: pt.y } };
      });
      setData({ ...dataRef.current, edges: newEdges });
      return;
    }

    // エッジドラッグ
    if (draggingEdge) {
      const pt = getCanvasPoint(e);
      setDraggingEdge(prev => prev ? { ...prev, toX: pt.x, toY: pt.y } : null);
      return;
    }

    // マーキー選択中
    if (isMarqueeSelecting && marqueeStart) {
      const pt = getCanvasPoint(e);
      setMarqueeEnd(pt);
      const r = {
        x: Math.min(marqueeStart.x, pt.x),
        y: Math.min(marqueeStart.y, pt.y),
        w: Math.abs(pt.x - marqueeStart.x),
        h: Math.abs(pt.y - marqueeStart.y),
      };
      const nextSelected = new Set(e.shiftKey ? selectedIds : []);
      (dataRef.current.nodes || []).forEach(n => {
        if (intersectRect(r, { x: n.x, y: n.y, w: n.width, h: n.height })) {
          getGroupIds(n.id).forEach(id => nextSelected.add(id));
        }
      });
      dataRef.current.strokes.forEach(s => {
        if (intersectStroke(r, s)) {
          getGroupIds(s.id).forEach(id => nextSelected.add(id));
        }
      });
      setSelectedIds(nextSelected);
      return;
    }

    // ノードドラッグ / リサイズ
    if (activeNodeAction) {
      const { ids, action, handle, startX, startY, startStates } = activeNodeAction;
      const dx = (e.clientX - startX) / camera.z;
      const dy = (e.clientY - startY) / camera.z;

      setData(prev => {
        const nd = { ...prev };
        if (action === 'drag') {
          nd.nodes = (prev.nodes || []).map(n => {
            if (!ids.includes(n.id)) return n;
            const start = startStates[n.id];
            return { ...n, x: snap(start.x + dx, isSnapToGrid), y: snap(start.y + dy, isSnapToGrid) };
          });
          nd.strokes = prev.strokes.map(s => {
            if (!ids.includes(s.id)) return s;
            const start = startStates[s.id];
            return { ...s, points: start.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy })) };
          });
        } else if (action === 'resize') {
          const id = ids[0];
          nd.nodes = (prev.nodes || []).map(n => {
            if (n.id !== id) return n;
            const start = startStates[n.id];
            let nx = start.x, ny = start.y, nw = start.w, nh = start.h;
            if (handle === 'e'  || handle === 'ne' || handle === 'se') nw = Math.max(50, snap(start.w + dx, isSnapToGrid));
            if (handle === 'w'  || handle === 'nw' || handle === 'sw') { nx = snap(start.x + dx, isSnapToGrid); nw = Math.max(50, start.w - dx); }
            if (handle === 's'  || handle === 'se' || handle === 'sw') nh = Math.max(50, snap(start.h + dy, isSnapToGrid));
            if (handle === 'n'  || handle === 'ne' || handle === 'nw') { ny = snap(start.y + dy, isSnapToGrid); nh = Math.max(50, start.h - dy); }
            if (n.type === 'youtube') {
              if (handle === 'n' || handle === 's') nw = nh * (16 / 9);
              else nh = nw * (9 / 16);
            }
            return { ...n, x: nx, y: ny, width: nw, height: nh };
          });
        }
        return nd;
      });
      return;
    }

    if (isPanning) {
      setCamera(c => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }));
      return;
    }

    if (shapeStartPt && (tool === 'rect' || tool === 'ellipse')) {
      setShapeCurPt(getCanvasPoint(e));
      return;
    }

    if (isDrawing && tool === 'pen') {
      setCurrentStroke(prev => [...prev, getCanvasPoint(e)]);
      return;
    }

    if (isDrawing && tool === 'eraser') {
      const p = getCanvasPoint(e);
      const r = 20 / camera.z;
      const newStrokes = dataRef.current.strokes.filter(s =>
        !s.points.some(sp => Math.hypot(sp.x - p.x, sp.y - p.y) < r)
      );
      if (newStrokes.length !== dataRef.current.strokes.length) {
        setData({ ...dataRef.current, strokes: newStrokes });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null); setMarqueeEnd(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    if (draggingCP) {
      updateContent(JSON.stringify(dataRef.current));
      commitHistoryOnPointerUp();
      setDraggingCP(null);
      return;
    }

    if (draggingEdge) {
      const pt = getCanvasPoint(e);
      const hitNode = (dataRef.current.nodes || []).find(n =>
        n.id !== draggingEdge.fromNodeId &&
        pt.x >= n.x && pt.x <= n.x + (n.width || 300) &&
        pt.y >= n.y && pt.y <= n.y + (n.height || 100)
      );
      if (hitNode) {
        const toSide = getNearestSide(hitNode, pt.x, pt.y);
        const newEdge: Edge = {
          id: crypto.randomUUID(), fromNodeId: draggingEdge.fromNodeId,
          fromSide: draggingEdge.fromSide, toNodeId: hitNode.id, toSide,
        };
        saveToHistory(JSON.stringify(dataRef.current));
        const nd = { ...dataRef.current, edges: [...(dataRef.current.edges || []), newEdge] };
        setData(nd); updateContent(JSON.stringify(nd));
      }
      setDraggingEdge(null); return;
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
      return;
    }

    if (isDrawing && tool === 'pen') {
      setIsDrawing(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (currentStroke.length > 0) {
        const smoothed = smoothStroke(currentStroke, 2);
        const newStroke: Stroke = { id: crypto.randomUUID(), points: smoothed, color: currentColor, width: currentWidth };
        const nd = { ...dataRef.current, strokes: [...dataRef.current.strokes, newStroke] };
        setData(nd); setCurrentStroke([]); updateContent(JSON.stringify(nd));
        commitHistoryOnPointerUp();
      }
      return;
    }

    if (isDrawing && tool === 'eraser') {
      setIsDrawing(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      updateContent(JSON.stringify(dataRef.current));
      commitHistoryOnPointerUp();
    }

    if (shapeStartPt && (tool === 'rect' || tool === 'ellipse')) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      const x = Math.min(shapeStartPt.x, shapeCurPt!.x);
      const y = Math.min(shapeStartPt.y, shapeCurPt!.y);
      const w = Math.abs(shapeCurPt!.x - shapeStartPt.x);
      const h = Math.abs(shapeCurPt!.y - shapeStartPt.y);
      if (w > 5 && h > 5) {
        const nw: RectNode = {
          id: crypto.randomUUID(), type: tool as 'rect' | 'ellipse', data: '',
          x, y, width: w, height: h, color: currentColor, fillColor: currentFillColor, strokeWidth: currentShapeStrokeWidth,
        };
        saveToHistory(JSON.stringify(dataRef.current));
        const nd = { ...dataRef.current, nodes: [...(dataRef.current.nodes || []), nw] };
        setData(nd); updateContent(JSON.stringify(nd));
        setSelectedIds(new Set([nw.id]));
      }
      setShapeStartPt(null); setShapeCurPt(null);
      commitHistoryOnPointerUp();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomFactor = -e.deltaY * 0.002;
    const newZ = Math.min(Math.max(camera.z * Math.exp(zoomFactor), 0.1), 10);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCamera({
      x: mx - (mx - camera.x) * (newZ / camera.z),
      y: my - (my - camera.y) * (newZ / camera.z),
      z: newZ,
    });
  };

  // ── レンダリング変数 ────────────────────────────────────────────────────────
  const selNode = selectedIds.size === 1 ? (data.nodes || []).find(n => selectedIds.has(n.id)) : null;
  const selStroke = selectedIds.size === 1 ? data.strokes.find(s => selectedIds.has(s.id)) : null;
  const selEdge = selectedIds.size === 1 ? (data.edges || []).find(e => selectedIds.has(e.id)) : null;
  const showInspector = tool === 'select' && selectedIds.size === 1 && (selStroke || selEdge || (selNode && selNode.type !== 'image' && selNode.type !== 'youtube' && selNode.type !== 'page'));

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#0a0a0a] select-none">

      {/* ツールバー */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
        <div className="flex items-center p-2 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl gap-2">
          <ToolBtn isActive={tool === 'select'} onClick={() => setTool('select')} title="選択・移動"><span>👆</span></ToolBtn>
          <ToolBtn isActive={tool === 'pan'} onClick={() => setTool('pan')} title="パン"><span>🖐</span></ToolBtn>
          <ToolBtn isActive={tool === 'pen'} onClick={() => setTool('pen')} title="描画"><span>✏️</span></ToolBtn>
          <ToolBtn isActive={tool === 'eraser'} onClick={() => setTool('eraser')} title="消しゴム"><span>🧹</span></ToolBtn>
          <div className="w-[1px] h-8 bg-white/20 mx-1" />
          <ToolBtn isActive={tool === 'text'} title="テキスト" onClick={() => {
              setTool('text');
              const cam = cameraRef.current;
              const nw: RectNode = {
                id: crypto.randomUUID(), type: 'text', data: '',
                x: -cam.x / cam.z + window.innerWidth / 2 / cam.z - 150,
                y: -cam.y / cam.z + window.innerHeight / 2 / cam.z - 50,
                width: 300, height: 100, color: currentTextColor, fontSize: currentTextSize,
              };
              saveToHistory(JSON.stringify(dataRef.current));
              const nd = { ...dataRef.current, nodes: [...(dataRef.current.nodes || []), nw] };
              setData(nd); updateContent(JSON.stringify(nd));
              setSelectedIds(new Set([nw.id])); setEditingTextNodeId(nw.id);
            }}><span>📝</span></ToolBtn>
          <ToolBtn isActive={tool === 'arrow'} onClick={() => setTool('arrow')} title="矢印で接続"><span>→</span></ToolBtn>
          <div className="w-[1px] h-8 bg-white/20 mx-1" />
          <ToolBtn isActive={tool === 'rect'} onClick={() => setTool('rect')} title="長方形"><span>□</span></ToolBtn>
          <ToolBtn isActive={tool === 'ellipse'} onClick={() => setTool('ellipse')} title="楕円"><span>○</span></ToolBtn>
          <div className="w-[1px] h-8 bg-white/20 mx-1" />
          <ToolBtn isActive={isSnapToGrid} onClick={() => setIsSnapToGrid(!isSnapToGrid)} title="スナップ"><span>{isSnapToGrid ? '🧲' : '🔓'}</span></ToolBtn>
          
          {selectedIds.size >= 2 && (
            <button onClick={groupSelected} className="px-3 h-12 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-all text-sm font-bold flex items-center gap-1">
              <span>🔗</span> Group
            </button>
          )}
          {Array.from(selectedIds).some(id => {
            const m = [...(data.nodes || []), ...data.strokes, ...(data.edges || [])].find(x => x.id === id);
            return !!m?.groupId;
          }) && (
            <button onClick={ungroupSelected} className="px-3 h-12 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-all text-sm font-bold flex items-center gap-1">
              <span>🔓</span> Ungroup
            </button>
          )}
        </div>

        <div className="flex items-center p-2 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl gap-2">
          <button className="w-10 h-10 rounded-xl transition-all text-white/50 hover:text-white disabled:opacity-20" onClick={handleUndo} disabled={undoLen === 0}><span>↩️</span></button>
          <button className="w-10 h-10 rounded-xl transition-all text-white/50 hover:text-white disabled:opacity-20" onClick={handleRedo} disabled={redoLen === 0}><span>↪️</span></button>
          <div className="w-[1px] h-6 bg-white/20 mx-1" />
          <button className="w-10 h-10 rounded-xl transition-all text-red-500/50 hover:text-red-400 disabled:opacity-20" onClick={handleDelete} disabled={selectedIds.size === 0}><span>🗑️</span></button>
        </div>
      </div>

      <div className="absolute bottom-8 left-8 z-50 bg-black/60 backdrop-blur rounded-lg border border-white/10 shadow-lg px-4 py-2 text-white/60 text-sm font-mono cursor-pointer" onClick={() => setCamera({ x: 0, y: 0, z: 1 })}>
        {Math.round(camera.z * 100)}%
      </div>

      {/* 設定・UIオーバレイ */}
      {tool === 'pen' && isStyleMenuOpen && <div className="absolute top-20 right-6 z-50 bg-black/80 p-4 rounded-2xl border border-white/10 w-[240px]">🎨 ペン設定...</div>}
      
      {contextMenu && (
        <div className="fixed z-[1000] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 w-48 select-none" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={e => e.stopPropagation()}>
          <button className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-blue-600 hover:text-white flex items-center gap-2" onClick={() => { duplicateSelected(); setContextMenu(null); }}><span>📂</span> 複製</button>
          <div className="h-px bg-white/5 mx-2 my-1" />
          <button className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-blue-600 hover:text-white flex items-center gap-2" onClick={() => { reorderSelected('front'); setContextMenu(null); }}><span>⬆️</span> 最前面へ</button>
          <button className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-blue-600 hover:text-white flex items-center gap-2" onClick={() => { reorderSelected('back'); setContextMenu(null); }}><span>⬇️</span> 最背面へ</button>
          <div className="h-px bg-white/5 mx-2 my-1" />
          <button className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-600 hover:text-white flex items-center gap-2" onClick={() => { handleDelete(); setContextMenu(null); }}><span>🗑️</span> 削除</button>
        </div>
      )}

      {showInspector && (() => {
        const typeLabel =
          selStroke ? '✏️ ストローク' :
          selEdge   ? '↔ エッジ' :
          selNode?.type === 'rect'    ? '□ 長方形' :
          selNode?.type === 'ellipse' ? '○ 楕円' : '📝 テキスト';
          
        const curColor = selStroke ? selStroke.color : selEdge ? (selEdge.color || '#666') : (selNode?.color || '#ffffff');
        const curWidth = selStroke ? selStroke.width : selEdge ? (selEdge.strokeWidth || 2) : 
                        selNode?.type === 'text' ? (selNode.fontSize || 24) : (selNode?.strokeWidth || 2);

        return (
          <div className="absolute top-20 right-6 z-50 flex flex-col bg-black/80 backdrop-blur-2xl shadow-2xl rounded-2xl border border-white/10 overflow-hidden w-[240px]">
            <div className="px-4 py-3 border-b border-white/10">
              <span className="text-sm font-medium text-white">{typeLabel}</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {/* 色選択 */}
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-3">Color</div>
                <div className="flex gap-2 justify-between">
                  {COLORS.map(c => (
                    <button key={c.id}
                      onClick={() => {
                        if (selStroke) patchStroke({ color: c.hex });
                        else if (selEdge) patchEdge({ color: c.hex });
                        else patchNode({ color: c.hex });
                      }}
                      className={`w-6 h-6 rounded-full transition-transform ${curColor === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
              </div>

              {/* 塗りつぶし (図形のみ) */}
              {(selNode?.type === 'rect' || selNode?.type === 'ellipse') && (
                <>
                  <div className="w-full h-px bg-white/10" />
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-3">Fill</div>
                    <div className="flex gap-2">
                       <button title="なし" onClick={() => patchNode({ fillColor: 'transparent' })}
                        className={`w-6 h-6 rounded-full border border-white/40 transition-transform ${(selNode.fillColor || 'transparent') === 'transparent' ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'}`}
                        style={{ background: 'linear-gradient(135deg, transparent 45%, #ff4b4b 45%, #ff4b4b 55%, transparent 55%)' }} />
                      {COLORS.map(c => (
                        <button key={c.id} onClick={() => patchNode({ fillColor: c.hex + '55' })}
                          className={`w-6 h-6 rounded-full transition-transform ${selNode.fillColor === c.hex + '55' ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c.hex + '55', border: `1px solid ${c.hex}` }} />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 矢印 (エッジのみ) */}
              {selEdge && (
                <>
                  <div className="w-full h-px bg-white/10" />
                  <button onClick={() => patchEdge({ showArrow: !(selEdge.showArrow ?? true) })}
                    className={`w-full py-2 px-3 rounded-lg border transition-all text-[10px] font-bold flex items-center justify-between ${
                      (selEdge.showArrow ?? true) ? 'bg-blue-500/20 border-blue-500/40 text-blue-200' : 'bg-white/5 border-white/10 text-white/50'
                    }`}>
                    <span>SHOW ARROW</span>
                    <span>{(selEdge.showArrow ?? true) ? 'ON' : 'OFF'}</span>
                  </button>
                </>
              )}

              {/* 太さ / サイズ */}
              <div className="w-full h-px bg-white/10" />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">
                    {selNode?.type === 'text' ? 'Font Size' : 'Stroke Width'}
                  </div>
                  <div className="text-[10px] font-mono text-white/60">{curWidth}px</div>
                </div>
                <input type="range" 
                  min={selNode?.type === 'text' ? 12 : 1} 
                  max={selNode?.type === 'text' ? 120 : 32} 
                  step={selEdge ? 0.5 : 1}
                  value={curWidth}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (selStroke) patchStroke({ width: v });
                    else if (selEdge) patchEdge({ strokeWidth: v });
                    else if (selNode?.type === 'text') patchNode({ fontSize: v });
                    else patchNode({ strokeWidth: v });
                  }}
                  className="w-full accent-blue-500 cursor-pointer" />
              </div>
            </div>
          </div>
        );
      })()}

      <div ref={containerRef} className="absolute inset-0 touch-none w-full h-full" 
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onWheel={handleWheel}
        onDrop={e => {
          const noteId = e.dataTransfer.getData("application/nemo-note-id");
          if (noteId) {
            e.preventDefault();
            const pt = getCanvasPoint(e as unknown as React.PointerEvent);
            const newNode: RectNode = {
              id: crypto.randomUUID(),
              type: 'note',
              data: noteId,
              x: snap(pt.x - 125, isSnapToGrid),
              y: snap(pt.y - 80, isSnapToGrid),
              width: 250,
              height: 160,
            };
            saveToHistory(JSON.stringify(dataRef.current));
            const nd = { ...dataRef.current, nodes: [...(dataRef.current.nodes || []), newNode] };
            setData(nd); updateContent(JSON.stringify(nd));
            setSelectedIds(new Set([newNode.id]));
          }
        }}
        onDragOver={e => {
          if (e.dataTransfer.types.includes("application/nemo-note-id")) {
            e.preventDefault();
          }
        }}
      >
        <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
          {drawGrid()}
          <rect width="100%" height="100%" fill="url(#dotGrid)" style={{ transform: `translate(${camera.x % (GRID_SIZE * camera.z)}px, ${camera.y % (GRID_SIZE * camera.z)}px) scale(${camera.z})`, transformOrigin: '0 0' }} />
        </svg>

        <div style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`, transformOrigin: '0 0', width: '100%', height: '100%' }} className="pointer-events-none absolute inset-0">
          {(data.nodes || []).map(node => (
            <div key={node.id} className={`absolute box-border ${selectedIds.has(node.id) ? 'ring-2 ring-blue-500 z-30' : 'shadow-md z-10'}`}
              style={{ left: node.x, top: node.y, width: node.type === 'text' ? 'max-content' : (node.width || 300), height: node.type === 'text' ? 'auto' : (node.height || 100), pointerEvents: 'auto', cursor: tool === 'select' ? 'move' : 'default' }}
              onPointerDown={e => {
                if (tool !== 'select' && !(tool === 'text' && node.type === 'text')) return;
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                const ids = getGroupIds(node.id);
                if (!e.shiftKey && !selectedIds.has(node.id)) setSelectedIds(new Set(ids));
                else if (e.shiftKey) selectItem(node.id, true);
                const currentIds = Array.from(selectedIds.has(node.id) ? selectedIds : new Set(ids));
                const starts: Record<string, any> = {};
                (dataRef.current.nodes || []).filter(n => currentIds.includes(n.id)).forEach(n => starts[n.id] = { x: n.x, y: n.y, w: n.width, h: n.height });
                dataRef.current.strokes.filter(s => currentIds.includes(s.id)).forEach(s => starts[s.id] = { points: [...s.points] });
                setActiveNodeAction({ ids: currentIds, action: 'drag', startX: e.clientX, startY: e.clientY, startStates: starts });
              }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, targetId: node.id, type: 'node' }); }}
            >
              {tool === 'arrow' && ['top','bottom','left','right'].map(side => (
                <div key={side} className="absolute w-3 h-3 bg-white border-2 border-blue-400 rounded-full z-40" 
                  style={{ 
                    top: side === 'top' ? -6 : side === 'bottom' ? 'auto' : '50%', 
                    bottom: side === 'bottom' ? -6 : 'auto',
                    left: side === 'left' ? -6 : side === 'right' ? 'auto' : '50%',
                    right: side === 'right' ? -6 : 'auto',
                    transform: (side === 'top' || side === 'bottom') ? 'translateX(-50%)' : 'translateY(-50%)',
                    cursor: 'crosshair'
                  }}
                  onPointerDown={e => { e.stopPropagation(); setDraggingEdge({ fromNodeId: node.id, fromSide: side as Side, toX: node.x, toY: node.y }); }}
                />
              ))}
              {node.type === 'image' && <img src={node.data} alt="Node" className="w-full h-full object-contain pointer-events-none" />}
              {node.type === 'youtube' && <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${node.data}`} style={{ pointerEvents: interactiveNodeId === node.id ? 'auto' : 'none' }} onDoubleClick={() => setInteractiveNodeId(node.id)} />}
              {node.type === 'text' && (
                <div onDoubleClick={() => { setEditingTextNodeId(node.id); setTool('text'); }}>
                  {editingTextNodeId === node.id ? 
                    <textarea autoFocus className="bg-transparent border-none outline-none resize-none" style={{ color: node.color, fontSize: node.fontSize, width: '100%' }} value={node.data} onChange={e => {
                      const val = e.target.value;
                      setData({ ...dataRef.current, nodes: dataRef.current.nodes?.map(n => n.id === node.id ? { ...n, data: val } : n) });
                    }} onBlur={() => { updateContent(JSON.stringify(dataRef.current)); setEditingTextNodeId(null); }} /> :
                    <div style={{ color: node.color, fontSize: node.fontSize }}>{node.data || 'Aa'}</div>
                  }
                </div>
              )}
              {node.type === 'rect' && <div className="w-full h-full" style={{ background: node.fillColor, border: `${node.strokeWidth}px solid ${node.color}` }} />}
              {node.type === 'ellipse' && <div className="w-full h-full rounded-full" style={{ background: node.fillColor, border: `${node.strokeWidth}px solid ${node.color}` }} />}
              
              {/* ── ノートカード ── */}
              {node.type === 'note' && (() => {
                const note = notes.find(n => n.id === node.data);
                const preview = note?.content.slice(0, 100).replace(/(\r\n|\n|\r)/gm, " ") || '内容がありません';
                return (
                  <div
                    className={`w-full h-full p-4 rounded-2xl border-2 shadow-xl flex flex-col gap-2 overflow-hidden transition-all bg-card-bg group
                      ${selectedIds.has(node.id) ? 'border-blue-500 ring-4 ring-blue-500/10 scale-[1.02]' : 'border-border-color hover:border-white/20'}`}
                    style={{ backdropFilter: 'blur(10px)' }}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-border-color pb-1">
                       <span className="text-xl leading-none flex-shrink-0">{note?.type === 'board' ? '🎨' : '📄'}</span>
                       <h3 className="flex-1 text-[13px] font-bold text-foreground truncate mt-1">{note?.title || '不明なノート'}</h3>
                       <button
                         className="p-1 px-1.5 rounded bg-white/5 hover:bg-white/10 text-blue-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 text-xs"
                         onClick={e => { e.stopPropagation(); activateNote(note?.id || null); }}
                         title="ノートを開く"
                       >
                         開く
                       </button>
                    </div>
                    <p className="flex-1 text-[11px] text-foreground/50 leading-relaxed overflow-hidden line-clamp-4 italic py-1">
                      {preview}{(note?.content?.length ?? 0) > 100 ? '...' : ''}
                    </p>
                  </div>
                );
              })()}
              
              {selectedIds.has(node.id) && selectedIds.size === 1 && node.type !== 'text' && RESIZE_HANDLES.map(h => (
                <div key={h.dir} className="absolute w-2 h-2 bg-blue-500 border border-white" style={{ ...h.style, cursor: h.cursor }} onPointerDown={e => {
                  e.stopPropagation();
                  setActiveNodeAction({ ids: [node.id], action: 'resize', handle: h.dir, startX: e.clientX, startY: e.clientY, startStates: { [node.id]: { x: node.x, y: node.y, w: node.width, h: node.height } } });
                }} />
              ))}
            </div>
          ))}

          {isMarqueeSelecting && marqueeStart && marqueeEnd && (
            <div className="absolute border border-blue-500 bg-blue-500/10 z-[100]" style={{ left: Math.min(marqueeStart.x, marqueeEnd.x), top: Math.min(marqueeStart.y, marqueeEnd.y), width: Math.abs(marqueeEnd.x - marqueeStart.x), height: Math.abs(marqueeEnd.y - marqueeStart.y) }} />
          )}

          <svg className="absolute inset-0 w-full h-full overflow-visible">
            {data.strokes.map(s => (
              <g key={s.id} 
                onPointerDown={e => { e.stopPropagation(); selectItem(s.id, e.shiftKey); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, targetId: s.id, type: 'stroke' }); }}
              >
                <path d={renderStroke(s.points)} stroke={selectedIds.has(s.id) ? 'rgba(59,130,246,0.5)' : 'transparent'} strokeWidth={s.width + 12} fill="none" strokeLinecap="round" style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />
                <path d={renderStroke(s.points)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" />
              </g>
            ))}
            {currentStroke.length > 0 && <path d={renderStroke(currentStroke)} stroke={currentColor} strokeWidth={currentWidth} fill="none" strokeLinecap="round" />}
          </svg>

          <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ zIndex: 25 }}>
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="currentColor" /></marker>
            </defs>
            {(data.edges || []).map(edge => {
              const from = data.nodes?.find(n => n.id === edge.fromNodeId);
              const to = data.nodes?.find(n => n.id === edge.toNodeId);
              if (!from || !to) return null;
              const fp = getDockPoint(from, edge.fromSide || 'right');
              const tp = getDockPoint(to, edge.toSide || 'left');
              const cp = getEdgeCPs(fp, edge.fromSide || 'right', tp, edge.toSide || 'left', edge);
              const d = `M${fp.x},${fp.y} C${cp.cp1.x},${cp.cp1.y} ${cp.cp2.x},${cp.cp2.y} ${tp.x},${tp.y}`;
              return (
                <g key={edge.id}
                  onPointerDown={e => { e.stopPropagation(); selectItem(edge.id, e.shiftKey); }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, targetId: edge.id, type: 'edge' }); }}
                >
                  <path d={d} stroke="transparent" strokeWidth={15} fill="none" style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />
                  <path d={d} stroke={selectedIds.has(edge.id) ? '#3b82f6' : (edge.color || '#666')} strokeWidth={edge.strokeWidth || 2} fill="none" markerEnd={(edge.showArrow ?? true) ? "url(#arrow)" : ""} style={{ color: edge.color || '#666' }} />
                  {selectedIds.has(edge.id) && (
                    <>
                      <circle cx={cp.cp1.x} cy={cp.cp1.y} r={5} fill="#3b82f6" style={{ cursor: 'move', pointerEvents: 'all' }} onPointerDown={e => { e.stopPropagation(); setDraggingCP({ edgeId: edge.id, which: 'cp1' }); }} />
                      <circle cx={cp.cp2.x} cy={cp.cp2.y} r={5} fill="#3b82f6" style={{ cursor: 'move', pointerEvents: 'all' }} onPointerDown={e => { e.stopPropagation(); setDraggingCP({ edgeId: edge.id, which: 'cp2' }); }} />
                    </>
                  )}
                </g>
              );
            })}
            {draggingEdge && <line x1={getDockPoint(data.nodes!.find(n => n.id === draggingEdge.fromNodeId)!, draggingEdge.fromSide).x} y1={getDockPoint(data.nodes!.find(n => n.id === draggingEdge.fromNodeId)!, draggingEdge.fromSide).y} x2={draggingEdge.toX} y2={draggingEdge.toY} stroke="#3b82f6" strokeDasharray="5,5" />}
          </svg>
        </div>
      </div>
    </div>
  );
}
