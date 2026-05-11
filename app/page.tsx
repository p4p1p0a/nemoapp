"use client";
import { useState, useRef } from "react";
import { useAppState } from "./hooks/useAppState";
import { Sidebar } from "./components/Sidebar";
import { NoteDetailView } from "./components/NoteDetailView";
import { AuthModal } from "./components/AuthModal";
import InfiniteBoard from "./components/InfiniteBoard";
import Calendar from "./components/Calendar";
import AppWindow from "./components/AppWindow";
import Taskbar from "./components/Taskbar";
import { DailyEditor } from "./components/DailyEditor";

export default function Home() {
  const {
    notes, setNotes, isLoaded,
    dailyContent, setDailyContent,
    dailyColor, setDailyColor,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    draggedNodeId, setDraggedNodeId,
    isDescendant,
    handleCreateNewNote, handleUpdateTitle, handleUpdateContent, handleDeleteNote, handleMoveNote,
    openOrCreateDailyNote,
    rootNotes,
    calendarEvents, setCalendarEvents, handleDeleteEvent,
    genres, setGenres, handleDeleteGenre,
    todayTitle, hasWrittenToday, handleDailySave, handleUpdateEmoji,
    theme, setTheme,
    user, handleLogout, lastError,
    windows, activeWindowId,
    openWindow, closeWindow, minimizeWindow, maximizeWindow, toggleWindow,
    focusWindow, moveWindow, resizeWindow,
    desktopShortcuts, setDesktopShortcuts,
  } = useAppState();

  const [draggingShortcutId, setDraggingShortcutId] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSidebar = () => {
    if (sidebarTimerRef.current) clearTimeout(sidebarTimerRef.current);
    setSidebarVisible(true);
  };
  const hideSidebar = () => {
    sidebarTimerRef.current = setTimeout(() => setSidebarVisible(false), 400);
  };
  const toggleSidebar = () => {
    if (sidebarTimerRef.current) clearTimeout(sidebarTimerRef.current);
    setSidebarVisible(prev => !prev);
  };

  if (!isLoaded) return <div className="min-h-screen" style={{ background: 'hsl(225,55%,14%)' }} />;

  const getWindowContent = (id: string) => {
    if (id === '__calendar__') {
      return (
        <Calendar
          notes={notes}
          onOpenDailyNote={openOrCreateDailyNote}
          onNavigateToNote={(noteId) => openWindow(noteId, notes.find(n => n.id === noteId)?.title || '無題')}
          events={calendarEvents}
          onSaveEvents={setCalendarEvents}
          onDeleteEvent={handleDeleteEvent}
          genres={genres}
          onSaveGenres={setGenres}
          onDeleteGenre={handleDeleteGenre}
        />
      );
    }
    const note = notes.find(n => n.id === id);
    if (!note) return <div className="p-8 text-white/30">ノートが見つかりません</div>;
    if (note.type === 'board') {
      return (
        <InfiniteBoard
          key={`board-${note.id}`}
          content={note.content}
          updateContent={(c) => handleUpdateContent(note.id, c)}
          notes={notes}
          activateNote={(noteId, title) => openWindow(noteId ?? '', title ?? '無題')}
        />
      );
    }
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <NoteDetailView
            activeNote={note}
            notes={notes}
            childNotes={notes.filter(n => n.parentId === note.id && !n.is_deleted)}
            activateNote={(noteId, title) => openWindow(noteId ?? '', title ?? '無題')}
            handleUpdateTitle={(title) => handleUpdateTitle(note.id, title)}
            handleUpdateContent={(content) => handleUpdateContent(note.id, content)}
            handleDeleteNote={handleDeleteNote}
            onSearchTag={(tag) => {
              setSearchQuery('#' + tag);
              showSidebar();
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      data-theme={theme}
      className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: 'linear-gradient(135deg, hsl(225,55%,12%) 0%, hsl(230,50%,16%) 100%)' }}
      onPointerMove={e => {
        if (draggingShortcutId) {
          setDesktopShortcuts(prev => prev.map(s => s.id === draggingShortcutId ? { ...s, x: s.x + e.movementX, y: s.y + e.movementY } : s));
        }
      }}
      onPointerUp={() => setDraggingShortcutId(null)}
      onPointerLeave={() => setDraggingShortcutId(null)}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        const noteId = e.dataTransfer.getData("application/nemo-note-id");
        if (noteId) {
          e.preventDefault();
          if (!desktopShortcuts.some(s => s.noteId === noteId)) {
            setDesktopShortcuts(prev => [...prev, {
              id: crypto.randomUUID(),
              noteId,
              x: e.clientX,
              y: e.clientY
            }]);
          }
        }
      }}
    >
      {/* Desktop Shortcuts */}
      {desktopShortcuts.map(sc => {
        const note = notes.find(n => n.id === sc.noteId);
        if (!note) return null;
        const icon = note.emoji || (note.type === 'board' ? '🎨' : '📄');
        return (
          <div
            key={sc.id}
            className={`absolute flex flex-col items-center gap-1 p-2 rounded-xl transition-all group ${draggingShortcutId === sc.id ? 'opacity-70' : 'hover:bg-white/10'}`}
            style={{ left: sc.x - 40, top: sc.y - 40, width: 80 }}
            onPointerDown={e => {
              if (e.button === 2) { // Right click to delete
                if (confirm('デスクトップからこのショートカットを削除しますか？（ノート自体は削除されません）')) {
                  setDesktopShortcuts(prev => prev.filter(s => s.id !== sc.id));
                }
                return;
              }
              setDraggingShortcutId(sc.id);
            }}
            onDoubleClick={e => {
              e.stopPropagation();
              openWindow(note.id, note.title, note.type);
            }}
            onContextMenu={e => e.preventDefault()}
            title="ダブルクリックで開く / 右クリックで削除"
          >
            <div className="w-12 h-12 flex items-center justify-center text-3xl bg-black/40 backdrop-blur-md rounded-2xl shadow-lg border border-white/10 group-hover:scale-105 transition-transform pointer-events-none">
              {icon}
            </div>
            <div className="w-full text-center pointer-events-none">
              <span className="text-[11px] font-medium text-white/90 leading-tight line-clamp-2 px-1 break-words drop-shadow-md" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {note.title || '無題'}
              </span>
            </div>
          </div>
        );
      })}
      {/* Error indicator */}
      {lastError && (
        <div className="fixed bottom-16 right-4 z-[9999] bg-black/80 backdrop-blur-md border border-red-500/50 rounded-lg p-3 text-[10px] font-mono text-red-100 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-bold">SYNC ERROR</span>
          </div>
          <div className="mt-1 max-w-[200px] break-words">{lastError}</div>
        </div>
      )}

      {/* Left hover zone (only active when sidebar is hidden) */}
      {!sidebarVisible && (
        <div
          className="fixed left-0 top-0 bottom-12 w-4 z-[1000]"
          onMouseEnter={showSidebar}
        />
      )}

      {/* Sidebar overlay */}
      <div
        className="fixed left-0 top-0 bottom-12 z-[999] flex"
        style={{
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={showSidebar}
        onMouseLeave={hideSidebar}
      >
        {/* Sidebar panel */}
        <div className="h-full flex flex-col" style={{ width: 280, background: 'rgba(10,10,30,0.96)', backdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Header */}
          <div className="px-4 pt-5 pb-3 flex items-center gap-2 border-b border-white/5">
            <span className="text-xl">🐟</span>
            <span className="text-sm font-bold text-white/80 tracking-wide">NemoApp</span>
            <div className="flex-1" />
            <button
              title={user ? `サインアウト (${user.email})` : 'サインイン'}
              onClick={() => user ? (confirm('サインアウトしますか？') && handleLogout()) : setIsAuthOpen(true)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${user ? 'text-green-400 bg-green-400/10' : 'text-white/40 hover:bg-white/10'}`}
            >👤</button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white/40 hover:bg-white/10 transition-all">⚙️</button>
          </div>
          {/* Tree */}
          <div className="flex-1 overflow-y-auto">
            <Sidebar
              notes={notes}
              activeTabId={activeWindowId}
              activateNote={(id, title) => id !== null && openWindow(id, title || '無題', notes.find(n => n.id === id)?.type)}
              draggedNodeId={draggedNodeId}
              setDraggedNodeId={setDraggedNodeId}
              isDescendant={isDescendant}
              sidebarWidth={280}
              isResizing={false}
              setIsResizing={() => {}}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleCreateNewNote={handleCreateNewNote}
              handleDeleteNote={handleDeleteNote}
              handleRenameNote={handleUpdateTitle}
              handleMoveNote={handleMoveNote}
              handleUpdateEmoji={handleUpdateEmoji}
            />
          </div>
        </div>
      </div>

      {/* Windows */}
      {windows.map(win => (
        <AppWindow
          key={win.id}
          win={win}
          onFocus={() => focusWindow(win.id)}
          onClose={() => closeWindow(win.id)}
          onMinimize={() => minimizeWindow(win.id)}
          onMaximize={() => maximizeWindow(win.id)}
          onMove={(x, y) => moveWindow(win.id, x, y)}
          onResize={(x, y, w, h) => resizeWindow(win.id, x, y, w, h)}
        >
          {getWindowContent(win.id)}
        </AppWindow>
      ))}

      {/* Taskbar */}
      <Taskbar
        windows={windows}
        onToggle={toggleWindow}
        activeWindowId={activeWindowId}
        onToggleSidebar={toggleSidebar}
      />

      {/* Settings modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <div className="bg-[#181828] border border-white/10 rounded-2xl shadow-2xl p-8 w-[400px] max-w-[95vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">設定</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-white/40 hover:text-white transition-colors">✕</button>
            </div>
            <div className="mb-8">
              <label className="block text-xs font-medium text-white/50 mb-4 tracking-wider uppercase">デザインテーマ</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { id: 'dark',  label: 'Dark',  color: '#111', text: '#fff' },
                  { id: 'light', label: 'Light', color: '#fff', text: '#111' },
                  { id: 'nord',  label: 'Nord',  color: '#2e3440', text: '#eceff4' },
                  { id: 'sepia', label: 'Sepia', color: '#f4ecd8', text: '#5b4636' },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setTheme(t.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === t.id ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
                    <div className="w-12 h-12 rounded-lg shadow-md border border-white/10 flex items-center justify-center text-xs" style={{ backgroundColor: t.color, color: t.text }}>Aa</div>
                    <span className="text-sm font-medium text-white/90">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-white/5 text-center">
              <p className="text-[11px] text-white/20 tracking-widest uppercase">NemoApp v3.0 — Desktop Edition</p>
            </div>
          </div>
        </div>
      )}

      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}

      {/* Mandatory Daily Editor Overlay */}
      {isLoaded && !hasWrittenToday && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl p-8 w-[800px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <DailyEditor
              todayTitle={todayTitle}
              dailyContent={dailyContent}
              setDailyContent={setDailyContent}
              dailyColor={dailyColor}
              setDailyColor={setDailyColor}
              handleDailySave={handleDailySave}
            />
          </div>
        </div>
      )}
    </div>
  );
}
