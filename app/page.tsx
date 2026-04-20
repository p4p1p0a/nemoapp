"use client";
import { useState } from "react";
import { useAppState } from "./hooks/useAppState";
import { Sidebar } from "./components/Sidebar";
import { DailyEditor } from "./components/DailyEditor";
import { WorkspaceView } from "./components/WorkspaceView";
import { NoteDetailView } from "./components/NoteDetailView";
import { AuthModal } from "./components/AuthModal";
import InfiniteBoard from "./components/InfiniteBoard";
import Calendar from "./components/Calendar";

export default function Home() {
  const {
    notes, setNotes, isLoaded,
    dailyContent, setDailyContent, handleDailySave,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    openedTabs, activeTabId,
    draggedNodeId, setDraggedNodeId,
    sidebarWidth, isResizing, setIsResizing,
    activateNote, closeTab,
    handleCreateNewNote, handleUpdateTitle, handleUpdateContent, handleDeleteNote,
    isDescendant,
    openOrCreateDailyNote,
    todayTitle, hasWrittenToday, shouldShowDailyEditor,
    activeNote, rootNotes, childNotes,
    calendarEvents, setCalendarEvents, handleDeleteEvent,
    genres, setGenres, handleDeleteGenre,
    theme, setTheme,
    dailyColor, setDailyColor,
    user, handleLogout,
  } = useAppState();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  if (!isLoaded) return <div className="min-h-screen bg-black" />;

  const isCalendarTab = activeTabId === '__calendar__';

  return (
    <div
      data-theme={theme}
      className={`flex h-screen bg-background text-foreground font-sans overflow-hidden ${
        isResizing ? "select-none cursor-col-resize" : ""
      }`}
    >
      {/* ===============================
          アクティビティバー（左端固定の縦型アイコンレール）
      =============================== */}
      <nav className="w-12 flex-shrink-0 flex flex-col items-center py-4 gap-1 bg-activity-bg border-r border-border-color z-20">
        {(
          [
            { id: "files",    icon: "📁", label: "ファイルツリー" },
            { id: "calendar", icon: "📅", label: "カレンダー"     },
          ] as const
        ).map(({ id, icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => {
              if (id === "calendar") {
                // カレンダーをタブとして開く（3-A）
                activateNote("__calendar__", "📅 カレンダー");
              } else {
                setActivePanel(prev => (prev === id ? null : id));
              }
            }}
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all duration-150
              ${
                id === "files"    && activePanel === "files"    ? "bg-white/15 text-white shadow-inner" :
                id === "calendar" && isCalendarTab              ? "bg-white/15 text-white shadow-inner" :
                "text-white/35 hover:bg-white/10 hover:text-white/70"
              }`}
          >
            {icon}
          </button>
        ))}

        <div className="flex-1" />

        <button
          title="設定"
          onClick={() => setIsSettingsOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-lg text-white/35 hover:bg-white/10 hover:text-white/70 transition-all duration-150"
        >
          ⚙️
        </button>

        <button
          title={user ? `サインアウト (${user.email})` : "サインイン"}
          onClick={() => {
            if (user) {
              if (confirm('サインアウトしますか？（ローカルキャッシュがクリアされます）')) handleLogout();
            } else {
              setIsAuthOpen(true);
            }
          }}
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all duration-150 mb-4
            ${user ? "text-green-400 bg-green-400/10" : "text-white/35 hover:bg-white/10"}`}
        >
          👤
        </button>
      </nav>

      {/* ===============================
          ファイルツリー サイドバー
      =============================== */}
      {activePanel === "files" && (
        <Sidebar
          notes={notes}
          setNotes={setNotes}
          activeTabId={activeTabId}
          activateNote={activateNote}
          draggedNodeId={draggedNodeId}
          setDraggedNodeId={setDraggedNodeId}
          isDescendant={isDescendant}
          sidebarWidth={sidebarWidth}
          isResizing={isResizing}
          setIsResizing={setIsResizing}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleCreateNewNote={handleCreateNewNote}
        />
      )}

      {/* ===============================
          メイン領域
      =============================== */}
      <main
        className={`flex-1 flex flex-col relative bg-[#000000] ${
          activeNote?.type === "board" || isCalendarTab
            ? "overflow-hidden"
            : "overflow-y-auto"
        }`}
      >
        {/* タブバー */}
        <div className="sticky top-0 bg-background border-b border-border-color flex items-center overflow-x-auto custom-scrollbar h-12 flex-shrink-0 z-20">
          {openedTabs.map(tab => (
            <div
              key={tab.id ?? "root"}
              onClick={() => activateNote(tab.id, tab.title)}
              className={`flex items-center gap-3 px-5 h-full border-r border-border-color cursor-pointer min-w-[120px] max-w-[200px] select-none transition-all group
                ${activeTabId === tab.id
                  ? "bg-white/5 text-foreground border-t-2 border-t-blue-500 font-medium shadow-inner"
                  : "bg-transparent text-foreground/50 hover:bg-white/5"
                }`}
            >
              <span className="truncate flex-1 text-xs">
                {tab.id === null ? "🏠 Workspace" : (tab.title || "無題")}
              </span>
              <span
                className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full transition-colors
                  ${activeTabId === tab.id
                    ? "text-white/40 hover:bg-white/10 hover:text-white"
                    : "text-transparent group-hover:text-white/30 hover:bg-white/10"
                  }`}
                onClick={e => closeTab(e, tab.id)}
                title="閉じる"
              >
                ✕
              </span>
            </div>
          ))}
        </div>

        {/* ── カレンダータブ ── */}
        {isCalendarTab ? (
          <div className="flex-1 relative overflow-hidden">
            <Calendar
              notes={notes}
              onOpenDailyNote={openOrCreateDailyNote}
              onNavigateToNote={(noteId) => {
                activateNote(noteId);
                setActivePanel("files");
              }}
              events={calendarEvents}
              onSaveEvents={setCalendarEvents}
              onDeleteEvent={handleDeleteEvent}
              genres={genres}
              onSaveGenres={setGenres}
              onDeleteGenre={handleDeleteGenre}
            />
          </div>

        /* ── ボードビュー ── */
        ) : activeNote?.type === "board" ? (
          <div className="flex-1 w-full h-full relative">
            <div className="absolute top-4 right-6 z-50 flex items-center bg-black/60 shadow-lg backdrop-blur border border-white/10 rounded-lg px-4 py-2">
              <input
                key={`title-${activeNote.id}`}
                type="text"
                className="bg-transparent border-none text-xl font-bold tracking-tight outline-none text-white placeholder:text-white/20 text-right w-[150px] focus:w-[250px] transition-all"
                defaultValue={activeNote.title}
                onChange={e => handleUpdateTitle(e.target.value)}
                placeholder="無題のボード"
              />
              <div className="w-[1px] h-4 bg-white/20 mx-3" />
              <span
                className="text-white/40 hover:text-red-400 cursor-pointer transition-colors text-sm"
                onClick={e => handleDeleteNote(activeNote.id, e)}
                title="ボードを削除"
              >
                🗑️
              </span>
            </div>
            <InfiniteBoard
              key={`board-${activeNote.id}`}
              content={activeNote.content}
              updateContent={handleUpdateContent}
              notes={notes}
              activateNote={activateNote}
            />
          </div>

        /* ── テキスト/ワークスペース ── */
        ) : (
          <div className="max-w-4xl w-full mx-auto p-8 md:p-12 lg:px-16 block min-h-full pb-32">
            {shouldShowDailyEditor ? (
              <DailyEditor
                todayTitle={todayTitle}
                dailyContent={dailyContent}
                setDailyContent={setDailyContent}
                dailyColor={dailyColor}
                setDailyColor={setDailyColor}
                handleDailySave={handleDailySave}
              />
            ) : activeTabId === null && hasWrittenToday ? (
              <WorkspaceView
                rootNotes={rootNotes}
                activateNote={activateNote}
                handleCreateNewNote={handleCreateNewNote}
                handleDeleteNote={handleDeleteNote}
              />
            ) : activeNote ? (
              <NoteDetailView
                activeNote={activeNote}
                notes={notes}
                childNotes={childNotes}
                activateNote={activateNote}
                handleUpdateTitle={handleUpdateTitle}
                handleUpdateContent={handleUpdateContent}
                handleDeleteNote={handleDeleteNote}
              />
            ) : (
              <div className="py-20 text-center text-white/30">
                ノートが開かれていません。
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===============================
          設定モーダル
      =============================== */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-2xl shadow-2xl p-8 w-[400px] max-w-[95vw]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">設定</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-white/50 mb-4 tracking-wider uppercase">
                デザインテーマ
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { id: "dark",  label: "Dark",  color: "#111", text: "#fff" },
                    { id: "light", label: "Light", color: "#fff", text: "#111" },
                    { id: "nord",  label: "Nord",  color: "#2e3440", text: "#eceff4" },
                    { id: "sepia", label: "Sepia", color: "#f4ecd8", text: "#5b4636" },
                  ] as const
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                      theme === t.id
                        ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10"
                        : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <div
                      className="w-12 h-12 rounded-lg shadow-md border border-white/10 flex items-center justify-center text-xs"
                      style={{ backgroundColor: t.color, color: t.text }}
                    >
                      Aa
                    </div>
                    <span className="text-sm font-medium text-white/90">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 text-center">
              <p className="text-[11px] text-white/20 tracking-widest uppercase">
                Anti Gravity Memo App v2.0
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===============================
          認証モーダル
      =============================== */}
      {isAuthOpen && (
        <AuthModal onClose={() => setIsAuthOpen(false)} />
      )}
    </div>
  );
}