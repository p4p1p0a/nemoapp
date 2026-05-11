"use client";

import { Note } from "../types";
import { SidebarNode } from "./SidebarNode";

interface SidebarProps {
  notes: Note[];
  activeTabId: string | null;
  activateNote: (id: string | null, title?: string) => void;
  draggedNodeId: string | null;
  setDraggedNodeId: (id: string | null) => void;
  isDescendant: (nodeId: string, targetId: string) => boolean;
  sidebarWidth: number;
  isResizing: boolean;
  setIsResizing: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleCreateNewNote: (type: "document" | "board", parentId?: string | null) => void;
  handleDeleteNote: (id: string, e: React.MouseEvent) => void;
  handleRenameNote: (id: string, title: string) => void;
  handleMoveNote: (id: string, parentId: string | null, targetId?: string, position?: 'above' | 'below' | 'inside') => void;
  handleUpdateEmoji: (id: string, emoji: string) => void;
}

export const Sidebar = ({
  notes,
  activeTabId,
  activateNote,
  draggedNodeId,
  setDraggedNodeId,
  isDescendant,
  sidebarWidth,
  isResizing,
  setIsResizing,
  searchQuery,
  setSearchQuery,
  handleCreateNewNote,
  handleDeleteNote,
  handleRenameNote,
  handleMoveNote,
  handleUpdateEmoji,
}: SidebarProps) => {
  const rootNotes = notes.filter(n => n.parentId === null).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  return (
    <aside
      className="bg-sidebar-bg border-r border-border-color flex flex-col pt-6 pb-6 h-full flex-shrink-0 relative"
      style={{ width: `${sidebarWidth}px` }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        if (draggedNodeId) {
          // ルート（親なし）へのドロップ
          handleMoveNote(draggedNodeId, null);
          setDraggedNodeId(null);
        }
      }}
    >
      {/* リサイズハンドル */}
      <div
        className={`absolute top-0 -right-1 w-2 h-full cursor-col-resize z-50 transition-colors ${
          isResizing ? "bg-blue-500 opacity-100" : "opacity-0 hover:opacity-100 bg-blue-500/50"
        }`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* 新規作成ボタン */}
      <div className="px-4 mb-2 flex gap-2">
        <button
          className="flex-1 flex items-center justify-center gap-1 bg-white/10 hover:bg-white/20 text-white font-medium text-sm py-2 px-2 rounded-lg transition-all duration-200 border border-white/5 shadow-sm active:scale-95"
          onClick={() => handleCreateNewNote("document")}
        >
          <span>＋</span> ページ
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-medium text-sm py-2 px-2 rounded-lg transition-all duration-200 border border-blue-500/20 shadow-sm active:scale-95"
          onClick={() => handleCreateNewNote("board")}
        >
          <span>🎨</span> ボード
        </button>
      </div>

      {/* 全文検索 */}
      <div className="px-4 mb-3">
        <input
          type="search"
          placeholder="🔍 検索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/30 transition-colors"
        />
      </div>

      {/* ツリー or 検索結果 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {searchQuery ? (
          <div className="flex flex-col gap-0.5 px-2">
            {notes
              .filter(
                n =>
                  n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  n.content.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .slice(0, 30)
              .map(note => {
                const excerptIdx = note.content.toLowerCase().indexOf(searchQuery.toLowerCase());
                const excerpt =
                  excerptIdx >= 0
                    ? note.content.slice(Math.max(0, excerptIdx - 20), excerptIdx + 60)
                    : note.content.slice(0, 60);
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      activateNote(note.id, note.title);
                      setSearchQuery("");
                    }}
                    className={`p-2 rounded-lg cursor-pointer transition-all hover:bg-white/10 ${
                      activeTabId === note.id ? "bg-white/10" : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-white truncate">
                      {note.title || "無題"}
                    </div>
                    {excerpt && (
                      <div className="text-[10px] text-white/40 mt-0.5 line-clamp-2">
                        {excerpt}&hellip;
                      </div>
                    )}
                  </div>
                );
              })}
            {notes.filter(
              n =>
                n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                n.content.toLowerCase().includes(searchQuery.toLowerCase())
            ).length === 0 && (
              <div className="px-4 py-4 text-xs text-white/30">
                該当するノートがありません。
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 mt-2">
            {rootNotes.map(note => (
              <SidebarNode
                key={note.id}
                note={note}
                notes={notes}
                activeTabId={activeTabId}
                activateNote={activateNote}
                draggedNodeId={draggedNodeId}
                setDraggedNodeId={setDraggedNodeId}
                isDescendant={isDescendant}
                onDelete={handleDeleteNote}
                onRename={handleRenameNote}
                onMove={handleMoveNote}
                onCreateChild={(parentId, type) => handleCreateNewNote(type, parentId)}
                onUpdateEmoji={handleUpdateEmoji}
              />
            ))}
            {rootNotes.length === 0 && (
              <div className="px-6 py-4 text-xs text-white/30">
                テキストファイルがありません。
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
