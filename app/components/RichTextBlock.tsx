"use client";

import { useState } from "react";
import { Note } from "../types";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface RichTextBlockProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  notes: Note[];
  onNavigate: (noteId: string, title: string) => void;
}

// ReadモードとEditモードを切り替えるハイブリッドブロック
export const RichTextBlock = ({
  value,
  onChange,
  placeholder,
  notes,
  onNavigate,
}: RichTextBlockProps) => {
  const [isEditing, setIsEditing] = useState(!value);

  if (isEditing) {
    return (
      <AutoResizeTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={true}
        onBlur={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div
      className="w-full block bg-transparent border-none text-base outline-none resize-none leading-relaxed text-white/90 min-h-[50px] py-1 cursor-text"
      onClick={() => setIsEditing(true)}
    >
      {value ? (
        <MarkdownRenderer
          content={value}
          notes={notes}
          onNavigate={onNavigate}
          onContentChange={onChange}
        />
      ) : (
        <span className="text-white/20">{placeholder}</span>
      )}
    </div>
  );
};
