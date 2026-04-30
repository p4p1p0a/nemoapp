"use client";
import { useRef, useCallback, useEffect } from "react";
import { AppWindowData, WinState } from "../types";

const MIN_W = 320, MIN_H = 200;
const TASKBAR_H = 48;

type ResizeDir = 'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw';
const HANDLES: { dir: ResizeDir; cursor: string; style: React.CSSProperties }[] = [
  { dir:'n',  cursor:'ns-resize',   style:{top:-4,left:8,right:8,height:8} },
  { dir:'s',  cursor:'ns-resize',   style:{bottom:-4,left:8,right:8,height:8} },
  { dir:'e',  cursor:'ew-resize',   style:{top:8,bottom:8,right:-4,width:8} },
  { dir:'w',  cursor:'ew-resize',   style:{top:8,bottom:8,left:-4,width:8} },
  { dir:'ne', cursor:'nesw-resize', style:{top:-4,right:-4,width:16,height:16} },
  { dir:'nw', cursor:'nwse-resize', style:{top:-4,left:-4,width:16,height:16} },
  { dir:'se', cursor:'nwse-resize', style:{bottom:-4,right:-4,width:16,height:16} },
  { dir:'sw', cursor:'nesw-resize', style:{bottom:-4,left:-4,width:16,height:16} },
];

interface Props {
  win: AppWindowData;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (x: number, y: number, w: number, h: number) => void;
  children: React.ReactNode;
}

export default function AppWindow({ win, onFocus, onClose, onMinimize, onMaximize, onMove, onResize, children }: Props) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ dir: ResizeDir; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);

  const onTitleBarDown = useCallback((e: React.PointerEvent) => {
    if (win.state === 'maximized') return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [win]);

  const onResizeDown = useCallback((dir: ResizeDir) => (e: React.PointerEvent) => {
    if (win.state !== 'normal') return;
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y, origW: win.width, origH: win.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [win]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const nx = Math.max(0, dragRef.current.origX + dx);
      const ny = Math.max(0, Math.min(window.innerHeight - TASKBAR_H - 40, dragRef.current.origY + dy));
      onMove(nx, ny);
    }
    if (resizeRef.current) {
      const { dir, startX, startY, origX, origY, origW, origH } = resizeRef.current;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (dir.includes('e')) nw = Math.max(MIN_W, origW + dx);
      if (dir.includes('s')) nh = Math.max(MIN_H, origH + dy);
      if (dir.includes('w')) { nx = origX + dx; nw = Math.max(MIN_W, origW - dx); }
      if (dir.includes('n')) { ny = origY + dy; nh = Math.max(MIN_H, origH - dy); }
      ny = Math.max(0, Math.min(window.innerHeight - TASKBAR_H - 40, ny));
      onResize(nx, ny, nw, nh);
    }
  }, [onMove, onResize]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null; resizeRef.current = null;
  }, []);

  useEffect(() => {
    if (win.state !== 'normal') { dragRef.current = null; resizeRef.current = null; }
  }, [win.state]);

  if (win.state === 'minimized') return null;

  const isMax = win.state === 'maximized';
  const style: React.CSSProperties = isMax
    ? { position:'fixed', inset:0, bottom: TASKBAR_H, zIndex: win.zIndex, borderRadius:0 }
    : { position:'fixed', left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex };

  return (
    <div
      style={style}
      className="flex flex-col bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
      onPointerDown={onFocus}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Resize handles */}
      {!isMax && HANDLES.map(h => (
        <div
          key={h.dir}
          style={{ position:'absolute', ...h.style, zIndex:10, cursor: h.cursor }}
          onPointerDown={onResizeDown(h.dir)}
        />
      ))}

      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 h-10 flex-shrink-0 bg-[#12122a] border-b border-white/8 select-none"
        style={{ cursor: isMax ? 'default' : 'move' }}
        onPointerDown={onTitleBarDown}
        onDoubleClick={onMaximize}
      >
        <span className="text-xs mr-1">
          {win.noteType === 'board' ? '🎨' : win.noteType === 'calendar' ? '📅' : win.noteType === 'daily' ? '📓' : '📄'}
        </span>
        <span className="flex-1 text-white/80 text-sm font-medium truncate">{win.title}</span>

        {/* window controls */}
        <div className="flex items-center gap-1 ml-2" onPointerDown={e => e.stopPropagation()}>
          {/* minimize */}
          <button
            onClick={onMinimize}
            className="w-3.5 h-3.5 rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors flex items-center justify-center group"
            title="最小化"
          >
            <span className="hidden group-hover:block text-[8px] text-yellow-900 font-bold">−</span>
          </button>
          {/* maximize */}
          <button
            onClick={onMaximize}
            className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-400 transition-colors flex items-center justify-center group"
            title={isMax ? '元に戻す' : '最大化'}
          >
            <span className="hidden group-hover:block text-[8px] text-green-900 font-bold">{isMax ? '⊡' : '⊞'}</span>
          </button>
          {/* close */}
          <button
            onClick={win.isPinned ? onMinimize : onClose}
            className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"
            title={win.isPinned ? '閉じる（最小化）' : '閉じる'}
          >
            <span className="hidden group-hover:block text-[8px] text-red-900 font-bold">✕</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
