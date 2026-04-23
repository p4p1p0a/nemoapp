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
                className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/[0.04] hover:border-white/20 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer flex flex-col h-[200px] group"
              >
                <h3 className="font-semibold text-lg text-white mb-3 truncate tracking-wide">
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
                <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/5">
                  <span className="text-[11px] text-white/30 font-mono tracking-wider">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    className="text-white/20 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                    onClick={e => { e.stopPropagation(); handleDeleteNote(note.id, e); }}
                    title="このノートを削除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
