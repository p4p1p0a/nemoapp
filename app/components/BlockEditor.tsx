"use client";

import { Note } from "../types";
import { RichTextBlock } from "./RichTextBlock";

interface BlockEditorProps {
  content: string;
  updateContent: (c: string) => void;
  notes: Note[];
  activateNote: (id: string | null, fallbackTitle?: string) => void;
}

// YouTube URL を角括弧で囲った埋め込みブロックを検出し、テキストブロックと交互に分割するエディタ
export const BlockEditor = ({
  content,
  updateContent,
  notes,
  activateNote,
}: BlockEditorProps) => {
  const regex =
    /(\[(?:https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/)[a-zA-Z0-9_-]+|https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+)\])/gi;
  const chunks = content.split(regex);

  const handleUpdateChunk = (index: number, newStr: string) => {
    const newContent = chunks.map((c, i) => (i === index ? newStr : c)).join("");
    updateContent(newContent);
  };

  const onNavigate = (noteId: string, title: string) => activateNote(noteId, title);

  return (
    <div className="block min-h-[35vh]">
      {chunks.map((chunk, index) => {
        const isVideo = index % 2 !== 0;

        if (isVideo) {
          const videoId = chunk.match(
            /(?:v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
          )?.[1];
          return (
            <div
              key={`${index}-${chunk}`}
              className="relative group my-4 rounded-xl overflow-hidden shadow-2xl w-full border border-white/10"
              style={{ paddingTop: "56.25%" }}
            >
              <input
                className="absolute top-0 right-0 z-10 w-full text-right py-2 px-4 text-[10px] font-mono text-white/0 bg-transparent border-none outline-none group-hover:text-white/60 focus:text-white focus:bg-black/80 transition-all cursor-text"
                value={chunk}
                onChange={(e) => handleUpdateChunk(index, e.target.value)}
                title="編集・削除するにはこのURLテキストを書き換えてください"
              />
              {videoId ? (
                <iframe
                  className="absolute top-0 left-0 w-full h-full pointer-events-auto"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allowFullScreen
                />
              ) : (
                <div className="absolute top-0 left-0 w-full h-full bg-red-900/50 flex flex-col items-center justify-center">
                  不正なURLです
                </div>
              )}
            </div>
          );
        }

        return (
          <RichTextBlock
            key={`text-${index}`}
            value={chunk}
            onChange={(val: string) => handleUpdateChunk(index, val)}
            placeholder={
              index === 0 && chunks.length === 1
                ? "# 見出し  **太字**  *イタリック*  `コード`\n- [ ] Todoリスト\n[[ページ名]] でリンク — 思考を展開する..."
                : ""
            }
            notes={notes}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
};
