"use client";

import { useState, useRef, useEffect } from "react";
import { Note } from "../types";

interface SidebarNodeProps {
  note: Note;
  depth?: number;
  notes: Note[];
  activeTabId: string | null;
  activateNote: (id: string | null, title?: string) => void;
  draggedNodeId: string | null;
  setDraggedNodeId: (id: string | null) => void;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  isDescendant: (nodeId: string, targetId: string) => boolean;
  onDelete?: (id: string, e: React.MouseEvent) => void;
  onCreateChild?: (parentId: string, type: 'document' | 'board') => void;
}

// ── コンテキストメニュー ───────────────────────────────────────────────────────
const ContextMenu = ({
  x, y, note, onClose, onRename, onDelete, onCreateDoc, onCreateBoard,
}: {
  x: number; y: number; note: Note;
  onClose: () => void; onRename: () => void; onDelete: () => void;
  onCreateDoc: () => void; onCreateBoard: () => void;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside click で閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  // ウィンドウ端を超えないように位置を調整
  const safeX = Math.min(x, window.innerWidth  - 196);
  const safeY = Math.min(y, window.innerHeight - 230);

  const updatedAt = new Date(note.updatedAt).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const Item = ({ icon, label, danger, onClick }: { icon: string; label: string; danger?: boolean; onClick: () => void }) => (
    <button
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors rounded-lg hover:bg-white/10 ${danger ? 'text-red-400' : 'text-white/80 hover:text-white'}`}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] w-48 bg-sidebar-bg/95 border border-border-color backdrop-blur-xl rounded-xl shadow-2xl py-2 px-1 flex flex-col gap-0.5"
      style={{ top: safeY, left: safeX }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* プロパティ */}
      <div className="px-3 py-2 border-b border-white/10 mb-1">
        <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">プロパティ</div>
        <div className="text-[11px] text-white/60 truncate">{note.title || '無題'}</div>
        <div className="text-[10px] text-white/30 mt-0.5">{note.type || 'document'} · {updatedAt}</div>
      </div>

      <Item icon="✏️" label="名前変更"           onClick={() => { onRename(); onClose(); }} />
      <Item icon="📄" label="子ページを追加"      onClick={() => { onCreateDoc(); onClose(); }} />
      <Item icon="🎨" label="子ボードを追加"      onClick={() => { onCreateBoard(); onClose(); }} />

      <div className="h-[1px] bg-white/10 my-1 mx-2" />
      <Item icon="🗑️" label="削除" danger onClick={() => { onDelete(); onClose(); }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export const SidebarNode = ({
  note,
  depth = 0,
  notes,
  activeTabId,
  activateNote,
  draggedNodeId,
  setDraggedNodeId,
  setNotes,
  isDescendant,
  onDelete,
  onCreateChild,
}: SidebarNodeProps) => {
  const childrenNodes = notes.filter(n => n.parentId === note.id);
  const isActive = note.id === activeTabId;
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // コンテキストメニュー
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // インライン名前変更
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(note.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== note.title) {
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, title: trimmed, updatedAt: Date.now() } : n));
    }
    setIsRenaming(false);
  };

  // D&D
  const toggleOpen = (e: React.MouseEvent) => { e.stopPropagation(); setIsOpen(!isOpen); };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedNodeId(note.id);
    e.dataTransfer.setData("application/nemo-note-id", note.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (draggedNodeId === note.id || (draggedNodeId && isDescendant(draggedNodeId, note.id))) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    if (!draggedNodeId) return;
    if (draggedNodeId === note.id || isDescendant(draggedNodeId, note.id)) return;
    setNotes(prev =>
      prev.map(n => n.id === draggedNodeId ? { ...n, parentId: note.id, updatedAt: Date.now() } : n)
    );
    setDraggedNodeId(null);
  };

  return (
    <div className="flex flex-col">
      {/* コンテキストメニュー */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          note={note}
          onClose={() => setCtxMenu(null)}
          onRename={() => { setRenameValue(note.title); setIsRenaming(true); }}
          onDelete={() => {
            if (!confirm('このノートを削除しますか？子ノートも全て削除されます。')) return;
            // 再帰的に削除
            const idsToDelete = new Set<string>([note.id]);
            const queue = [note.id];
            while (queue.length > 0) {
              const cur = queue.pop()!;
              notes.filter(n => n.parentId === cur).forEach(n => { idsToDelete.add(n.id); queue.push(n.id); });
            }
            setNotes(prev => prev.filter(n => !idsToDelete.has(n.id)));
          }}
          onCreateDoc={()   => onCreateChild?.(note.id, 'document')}
          onCreateBoard={() => onCreateChild?.(note.id, 'board')}
        />
      )}

      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
        className={`flex items-center gap-1 cursor-pointer transition-colors rounded text-sm group select-none
          ${isActive ? "bg-accent-blue text-white font-medium" : "hover:bg-accent-hover text-foreground/60"}
          ${isDragOver ? "ring-2 ring-accent-blue bg-accent-blue/10" : ""}
        `}
        style={{
          paddingLeft:   `${depth * 16 + 12}px`,
          paddingRight:  "12px",
          paddingTop:    "6px",
          paddingBottom: "6px",
        }}
      >
        <div
          className="w-5 h-5 flex items-center justify-center text-[10px] text-white/30 hover:bg-white/10 rounded transition-colors"
          onClick={toggleOpen}
        >
          {childrenNodes.length > 0
            ? isOpen ? "▾" : "▸"
            : note.type === "board" ? "🎨" : "📄"}
        </div>

        {/* インライン名前変更モード */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="flex-1 bg-white/10 text-white text-sm px-1 py-0 rounded outline-none border border-white/30 min-w-0"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(note.title); }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="truncate flex-1 pl-1"
            onClick={() => activateNote(note.id, note.title)}
          >
            {note.color && (
              <span 
                className="inline-block w-2 h-2 rounded-full mr-1.5 mb-0.5 shadow-[0_0_5px_rgba(0,0,0,0.3)] transition-all animate-fade-in"
                style={{ backgroundColor: note.color }}
              />
            )}
            {note.title || "無題"}
          </span>
        )}
      </div>

      {isOpen && childrenNodes.length > 0 && (
        <div className="flex flex-col relative">
          {/* インデントガイド縦線 */}
          <div
            className="absolute top-1 bottom-1 w-[1px] bg-white/10"
            style={{ left: `${depth * 16 + 22}px` }}
          />
          {childrenNodes.map(child => (
            <SidebarNode
              key={child.id}
              note={child}
              depth={depth + 1}
              notes={notes}
              activeTabId={activeTabId}
              activateNote={activateNote}
              draggedNodeId={draggedNodeId}
              setDraggedNodeId={setDraggedNodeId}
              setNotes={setNotes}
              isDescendant={isDescendant}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  );
};
