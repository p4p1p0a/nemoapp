"use client";

import { useState } from "react";
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
}

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
}: SidebarNodeProps) => {
  const childrenNodes = notes.filter(n => n.parentId === note.id);
  const isActive = note.id === activeTabId;
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedNodeId(note.id);
    e.dataTransfer.setData("application/nemo-note-id", note.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedNodeId === note.id || (draggedNodeId && isDescendant(draggedNodeId, note.id))) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!draggedNodeId) return;
    if (draggedNodeId === note.id || isDescendant(draggedNodeId, note.id)) return;
    setNotes(prev =>
      prev.map(n =>
        n.id === draggedNodeId ? { ...n, parentId: note.id, updatedAt: Date.now() } : n
      )
    );
    setDraggedNodeId(null);
  };

  return (
    <div className="flex flex-col">
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-1 cursor-pointer transition-colors rounded text-sm group select-none
          ${isActive ? "bg-white/10 text-white font-medium" : "hover:bg-white/5 text-white/60"}
          ${isDragOver ? "ring-2 ring-blue-500 bg-blue-500/10" : ""}
        `}
        style={{
          paddingLeft: `${depth * 16 + 12}px`,
          paddingRight: "12px",
          paddingTop: "6px",
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

        <span
          className="truncate flex-1 pl-1"
          onClick={() => activateNote(note.id, note.title)}
        >
          {note.title || "無題"}
        </span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
};
