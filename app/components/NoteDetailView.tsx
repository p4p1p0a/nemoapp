"use client";

import { useState, useEffect } from "react";
import { Note } from "../types";
import { extractYouTubeIds } from "../lib/utils";
import { BlockEditor } from "./BlockEditor";

// ── カレンダーイベントの最小型（localStorage から読む用） ────────────────────
type SimpleEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string;
};

// デイリーノートの親チェーンから YYYY-MM-DD を逆引き
function getDailyNoteDate(note: Note, allNotes: Note[]): string | null {
  if (note.type !== 'daily') return null;
  const monthFolder = allNotes.find(n => n.id === note.parentId);
  if (!monthFolder) return null;
  const yearFolder = allNotes.find(n => n.id === monthFolder.parentId);
  if (!yearFolder) return null;
  return `${yearFolder.title}-${monthFolder.title.padStart(2,'0')}-${note.title.padStart(2,'0')}`;
}

// 今日の予定ボックス（デイリーノートのみ表示）
function DailyScheduleBox({ note, notes }: { note: Note; notes: Note[] }) {
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const dateStr = getDailyNoteDate(note, notes);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nemo-calendar-events');
      if (raw) setEvents(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [note.id]);

  if (!dateStr) return null;

  const dayEvents = events
    .filter(e => e.date === dateStr)
    .sort((a, b) => (a.allDay ? '00:00' : a.startTime).localeCompare(b.allDay ? '00:00' : b.startTime));

  return (
    <div className="my-6 border border-white/10 rounded-xl overflow-hidden bg-white/[0.015]">
      <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex items-center gap-2">
        <span className="text-base">📅</span>
        <span className="text-sm font-medium text-white/80">今日の予定</span>
        <span className="text-xs text-white/25 ml-auto font-mono">{dateStr}</span>
      </div>
      {dayEvents.length === 0 ? (
        <div className="px-4 py-4 text-sm text-white/30">この日の予定はありません</div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {dayEvents.map(ev => (
            <div key={ev.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{ev.title}</div>
                {!ev.allDay && ev.startTime && (
                  <div className="text-xs text-white/40 mt-0.5">
                    {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''}
                  </div>
                )}
              </div>
              {ev.allDay && <span className="text-[10px] text-white/30 flex-shrink-0 border border-white/10 px-1.5 py-0.5 rounded">終日</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


interface NoteDetailViewProps {
  activeNote: Note;
  notes: Note[];
  childNotes: Note[];
  activateNote: (id: string | null, title?: string) => void;
  handleUpdateTitle: (title: string) => void;
  handleUpdateContent: (content: string) => void;
  handleDeleteNote: (id: string, e: React.MouseEvent) => void;
}

export const NoteDetailView = ({
  activeNote,
  notes,
  childNotes,
  activateNote,
  handleUpdateTitle,
  handleUpdateContent,
  handleDeleteNote,
}: NoteDetailViewProps) => {
  const backlinks = notes.filter(
    n => n.id !== activeNote.id && n.content.includes(`[[${activeNote.title}]]`)
  );

  return (
    <>
      {/* タイトル */}
      <div className="flex items-center justify-between mt-4 mb-8">
        <input
          key={`title-${activeNote.id}`}
          type="text"
          className="w-full mr-4 bg-transparent border-none text-4xl font-bold tracking-tight outline-none text-white placeholder:text-white/20"
          defaultValue={activeNote.title}
          onChange={e => handleUpdateTitle(e.target.value)}
          placeholder="ページタイトル..."
        />
        <span
          className="text-white/20 hover:text-red-400 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors flex-shrink-0"
          onClick={e => handleDeleteNote(activeNote.id, e)}
          title="このノートとその下の全ての子ノートを削除"
        >
          🗑️ 削除
        </span>
      </div>

      {/* ブロックエディタ */}
      <section className="block animate-fade-in relative min-h-[25vh] pb-16">
        <BlockEditor
          key={`editor-${activeNote.id}`}
          content={activeNote.content}
          updateContent={handleUpdateContent}
          notes={notes}
          activateNote={activateNote}
        />
      </section>

      {/* 📅 今日の予定（デイリーノートのみ） */}
      {activeNote.type === 'daily' && (
        <DailyScheduleBox note={activeNote} notes={notes} />
      )}

      {/* 子ノートカード */}
      <section className="flex flex-col gap-6 pb-20 border-t border-white/10 pt-12 mt-8">
        <div className="flex items-center gap-3 text-white/60 text-lg font-medium">
          <span>🔗</span> リンクされた子ノート ({childNotes.length})
        </div>

        {childNotes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {childNotes.map(note => {
              const yIds = extractYouTubeIds(note.content);
              return (
                <div
                  key={note.id}
                  onClick={() => activateNote(note.id, note.title)}
                  className="bg-[#0a0a0a] border border-white/10 rounded-xl p-5 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col h-[180px]"
                >
                  <h3 className="font-semibold text-white mb-2 truncate">
                    {note.title || "無題"}
                  </h3>
                  {yIds.length > 0 && (
                    <div className="mb-2 rounded-md overflow-hidden border border-white/5 h-20 flex-shrink-0 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${yIds[0]}/mqdefault.jpg`}
                        alt="YouTube preview"
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-600 text-white rounded-[10px] w-8 h-5 flex items-center justify-center text-[10px] bg-opacity-80">
                          ▶
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-white/50 text-xs line-clamp-3 mb-3 flex-1 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                  <div className="flex justify-between items-center mt-auto">
                    <span className="text-[10px] text-white/30 font-mono">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    <span
                      className="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors"
                      onClick={e => handleDeleteNote(note.id, e)}
                    >
                      🗑️
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* バックリンク */}
        {backlinks.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-white/60 text-lg font-medium mt-8 pt-8 border-t border-white/10">
              <span>↩️</span> リンクされたノート ({backlinks.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {backlinks.map(note => (
                <div
                  key={note.id}
                  onClick={() => activateNote(note.id, note.title)}
                  className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4 hover:border-blue-500/40 hover:bg-blue-500/5 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-blue-400/60 text-sm">↩️</span>
                    <h3 className="font-semibold text-white truncate text-sm">
                      {note.title || "無題"}
                    </h3>
                  </div>
                  <p className="text-white/40 text-xs line-clamp-2 leading-relaxed">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
};
