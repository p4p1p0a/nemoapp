"use client";

import { useAppState } from "./hooks/useAppState";
import { Sidebar } from "./components/Sidebar";
import { DailyEditor } from "./components/DailyEditor";
import { WorkspaceView } from "./components/WorkspaceView";
import { NoteDetailView } from "./components/NoteDetailView";
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
  } = useAppState();

  if (!isLoaded) return <div className="min-h-screen bg-black" />;

  return (
    <div
      className={`flex h-screen bg-black text-white font-sans overflow-hidden ${
        isResizing ? "select-none cursor-col-resize" : ""
      }`}
    >
      {/* ===============================
          アクティビティバー（左端固定の縦型アイコンレール）
      =============================== */}
      <nav className="w-12 flex-shrink-0 flex flex-col items-center py-4 gap-1 bg-[#070707] border-r border-white/[0.06] z-20">
        {(
          [
            { id: "files",    icon: "📁", label: "ファイルツリー" },
            { id: "calendar", icon: "📅", label: "カレンダー"     },
          ] as const
        ).map(({ id, icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => setActivePanel(prev => (prev === id ? null : id))}
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all duration-150
              ${activePanel === id
                ? "bg-white/15 text-white shadow-inner"
                : "text-white/35 hover:bg-white/10 hover:text-white/70"
              }`}
          >
            {icon}
          </button>
        ))}
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
          カレンダー（アクティビティバーから全画面）
      =============================== */}
      {activePanel === "calendar" && (
        <Calendar
          notes={notes}
          onOpenDailyNote={openOrCreateDailyNote}
          onNavigateToNote={(noteId) => {
            activateNote(noteId);
            setActivePanel("files");
          }}
        />
      )}

      {/* ===============================
          メイン領域
      =============================== */}
      <main
        className={`flex-1 flex flex-col relative bg-[#000000]
          ${activeNote?.type === "board" ? "overflow-hidden" : "overflow-y-auto"}
          ${activePanel === "calendar" ? "hidden" : ""}`}
      >
        {/* タブバー */}
        <div className="sticky top-0 bg-[#050505] border-b border-white/10 flex items-center overflow-x-auto custom-scrollbar h-12 flex-shrink-0 z-20">
          {openedTabs.map(tab => (
            <div
              key={tab.id ?? "root"}
              onClick={() => activateNote(tab.id, tab.title)}
              className={`flex items-center gap-3 px-5 h-full border-r border-white/10 cursor-pointer min-w-[120px] max-w-[200px] select-none transition-all group
                ${activeTabId === tab.id
                  ? "bg-[#111111] text-white border-t-2 border-t-blue-500 font-medium shadow-inner"
                  : "bg-transparent text-white/50 hover:bg-white/5"
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

        {/* ボードビュー */}
        {activeNote?.type === "board" ? (
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
        ) : (
          <div className="max-w-4xl w-full mx-auto p-8 md:p-12 lg:px-16 block min-h-full pb-32">
            {shouldShowDailyEditor ? (
              <DailyEditor
                todayTitle={todayTitle}
                dailyContent={dailyContent}
                setDailyContent={setDailyContent}
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
    </div>
  );
}