"use client";

import { Note } from "../types";
import { extractYouTubeIds } from "../lib/utils";

interface WorkspaceViewProps {
  rootNotes: Note[];
  activateNote: (id: string | null, title?: string) => void;
  handleCreateNewNote: (type: "document" | "board") => void;
  handleDeleteNote: (id: string, e: React.MouseEvent) => void;
}

export const WorkspaceView = ({
  rootNotes,
  activateNote,
  handleCreateNewNote,
  handleDeleteNote,
}: WorkspaceViewProps) => {
  return (
    <section className="flex flex-col gap-6 animate-fade-in mt-4 border-t border-white/10 pt-4 mb-16">
      <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Workspace のルートノート
        </h1>
        <button
          onClick={() => handleCreateNewNote("document")}
          className="text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded transition-colors"
        >
          ＋ 新規ノート
        </button>
      </div>

      {rootNotes.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl p-10 text-center text-white/30">
          ルートにノートがありません。
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {rootNotes.map(note => {
            const yIds = extractYouTubeIds(note.content);
            return (
              <div
                key={note.id}
                onClick={() => activateNote(note.id, note.title)}
                className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col h-[200px]"
              >
                <h3 className="font-semibold text-lg text-white mb-3 truncate">
                  {note.title || "無題"}
                </h3>
                {yIds.length > 0 && (
                  <div className="mb-3 rounded-lg overflow-hidden border border-white/5 h-24 flex-shrink-0 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://img.youtube.com/vi/${yIds[0]}/mqdefault.jpg`}
                      alt="YouTube preview"
                      className="w-full h-full object-cover opacity-80"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-red-600 text-white rounded-full w-8 h-6 flex items-center justify-center text-xs font-bold bg-opacity-90">
                        ▶
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-white/50 text-sm line-clamp-3 mb-4 flex-1 whitespace-pre-wrap leading-relaxed">
                  {note.content}
                </p>
                <div className="flex justify-between items-center mt-auto">
                  <span className="text-xs text-white/30 font-mono">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                  <span
                    className="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors"
                    onClick={e => handleDeleteNote(note.id, e)}
                    title="このノートを削除"
                  >
                    🗑️
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
