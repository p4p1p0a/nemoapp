"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Note, AppWindowData, WinState, CalendarEvent, Genre, DesktopShortcut } from "../types";
import { getTodayString } from "../lib/utils";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

function getOrCreateFolder(updatedNotes: Note[], title: string, parentId: string | null): Note {
  let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title && !n.is_deleted);
  if (!folder) {
    folder = { id: crypto.randomUUID(), title, content: '', parentId, updatedAt: Date.now() };
    updatedNotes.push(folder);
  }
  return folder;
}

const CALENDAR_WIN: AppWindowData = {
  id: '__calendar__', title: 'カレンダー', noteType: 'calendar',
  state: 'minimized', x: 80, y: 60, width: 1000, height: 680,
  zIndex: 1, isPinned: true,
};

let zCounter = 100;
const nextZ = () => ++zCounter;

const cascade = (index: number) => ({
  x: 80 + index * 30,
  y: 60 + index * 30,
});

export function useAppState() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [dailyContent, setDailyContent] = useState('');
  const [dailyColor, setDailyColor] = useState('#3b82f6');
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePanel, setActivePanel] = useState<'files' | null>('files');
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light' | 'nord' | 'sepia'>('dark');
  const [desktopShortcuts, setDesktopShortcuts] = useState<DesktopShortcut[]>([]);

  // ── ウィンドウシステム ────────────────────────────────────────────────────
  const [windows, setWindows] = useState<AppWindowData[]>([CALENDAR_WIN]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const windowCountRef = useRef(0);

  const focusWindow = useCallback((id: string) => {
    setActiveWindowId(id);
    setWindows(prev => prev.map(w => w.id === id ? { ...w, zIndex: nextZ() } : w));
  }, []);

  const openWindow = useCallback((id: string, title: string, noteType?: AppWindowData['noteType']) => {
    setWindows(prev => {
      const existing = prev.find(w => w.id === id);
      if (existing) {
        // すでに開いている場合は前面に & 最小化解除
        return prev.map(w => w.id === id ? { ...w, state: 'normal', zIndex: nextZ() } : w);
      }
      const idx = windowCountRef.current++;
      const pos = cascade(idx % 8);
      const newWin: AppWindowData = {
        id, title, noteType, state: 'normal',
        x: pos.x, y: pos.y, width: 900, height: 600,
        zIndex: nextZ(),
      };
      return [...prev, newWin];
    });
    setActiveWindowId(id);
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const win = prev.find(w => w.id === id);
      if (win?.isPinned) return prev.map(w => w.id === id ? { ...w, state: 'minimized' } : w);
      return prev.filter(w => w.id !== id);
    });
    setActiveWindowId(prev => prev === id ? null : prev);
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, state: 'minimized' } : w));
    setActiveWindowId(prev => prev === id ? null : prev);
  }, []);

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w => {
      if (w.id !== id) return w;
      if (w.state === 'maximized') {
        return { ...w, state: 'normal', ...(w.prevRect ?? {}) };
      }
      return { ...w, state: 'maximized', prevRect: { x: w.x, y: w.y, width: w.width, height: w.height } };
    }));
  }, []);

  const toggleWindow = useCallback((id: string) => {
    setWindows(prev => {
      const win = prev.find(w => w.id === id);
      if (!win) return prev;
      if (win.state === 'minimized') {
        return prev.map(w => w.id === id ? { ...w, state: 'normal', zIndex: nextZ() } : w);
      }
      if (id === activeWindowId) {
        return prev.map(w => w.id === id ? { ...w, state: 'minimized' } : w);
      }
      return prev.map(w => w.id === id ? { ...w, zIndex: nextZ() } : w);
    });
    setActiveWindowId(prev => {
      const win = windows.find(w => w.id === id);
      if (win?.state === 'minimized') return id;
      if (prev === id) return null;
      return id;
    });
  }, [activeWindowId, windows]);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, x, y } : w));
  }, []);

  const resizeWindow = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, x, y, width, height } : w));
  }, []);

  const updateWindowTitle = useCallback((id: string, title: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, title } : w));
  }, []);

  // ── Supabase auth ────────────────────────────────────────────────────────
  const fetchAllFromSupabase = async (userId: string) => {
    const { data: n } = await supabase.from('notes').select('*').eq('user_id', userId);
    const { data: e } = await supabase.from('calendar_events').select('*').eq('user_id', userId);
    const { data: g } = await supabase.from('genres').select('*').eq('user_id', userId);
    return {
      remoteNotes: (n || []) as any as Note[],
      remoteEvents: (e || []) as any as CalendarEvent[],
      remoteGenres: (g || []) as any as Genre[]
    };
  };

  const syncData = async (currentUser: User) => {
    const { remoteNotes, remoteEvents, remoteGenres } = await fetchAllFromSupabase(currentUser.id);
    setNotes(current => {
      const merged = [...current];
      remoteNotes.forEach(rn => {
        const idx = merged.findIndex(n => n.id === rn.id);
        if (idx === -1) merged.push(rn);
        else if (rn.updatedAt > merged[idx].updatedAt) merged[idx] = rn;
      });
      const toPush = merged.filter(n => {
        const rn = remoteNotes.find(r => r.id === n.id);
        return !rn || n.updatedAt > (rn.updatedAt || 0);
      });
      if (toPush.length > 0) supabase.from('notes').upsert(toPush.map(n => ({ ...n, user_id: currentUser.id }))).then();
      return merged;
    });
    setCalendarEvents(current => {
      const merged = [...current];
      remoteEvents.forEach(re => {
        const idx = merged.findIndex(e => e.id === re.id);
        if (idx === -1) merged.push(re);
        else if (re.updatedAt > merged[idx].updatedAt) merged[idx] = re;
      });
      const toPush = merged.filter(e => {
        const re = remoteEvents.find(r => r.id === e.id);
        return !re || e.updatedAt > (re.updatedAt || 0);
      });
      if (toPush.length > 0) supabase.from('calendar_events').upsert(toPush.map(e => ({ ...e, user_id: currentUser.id }))).then();
      return merged;
    });
    setGenres(current => {
      const merged = [...current];
      remoteGenres.forEach(rg => {
        const idx = merged.findIndex(g => g.id === rg.id);
        if (idx === -1) merged.push(rg);
        else if (rg.updatedAt > merged[idx].updatedAt) merged[idx] = rg;
      });
      const toPush = merged.filter(g => {
        const rg = remoteGenres.find(r => r.id === g.id);
        return !rg || g.updatedAt > (rg.updatedAt || 0);
      });
      if (toPush.length > 0) supabase.from('genres').upsert(toPush.map(g => ({ ...g, user_id: currentUser.id }))).then();
      return merged;
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) { supabase.auth.signOut().catch(() => {}); setUser(null); return; }
      setUser(session?.user ?? null);
      if (session?.user) syncData(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) syncData(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── リアルタイム同期 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('realtime-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, payload => {
        const newData = payload.new as Note;
        setNotes(current => current.findIndex(n => n.id === newData.id) !== -1 ? current : [...current, newData]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, payload => {
        const newData = payload.new as Note;
        setNotes(current => {
          const idx = current.findIndex(n => n.id === newData.id);
          if (idx === -1) return [...current, newData];
          if (newData.updatedAt > (current[idx].updatedAt || 0)) {
            const next = [...current]; next[idx] = newData; return next;
          }
          return current;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, payload => {
        const deletedId = (payload.old as { id?: string }).id;
        if (deletedId) setNotes(current => current.filter(n => n.id !== deletedId));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as CalendarEvent;
          setCalendarEvents(current => {
            const idx = current.findIndex(e => e.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current]; next[idx] = newData; return next;
            }
            return current;
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'genres' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as Genre;
          setGenres(current => {
            const idx = current.findIndex(g => g.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current]; next[idx] = newData; return next;
            }
            return current;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── localStorage ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const savedNotes  = localStorage.getItem('hybrid-memo-notes');
      const savedWidth  = localStorage.getItem('hybrid-memo-sidebar-width');
      const savedEvents = localStorage.getItem('nemo-calendar-events');
      const savedGenres = localStorage.getItem('nemo-calendar-genres');
      const savedTheme  = localStorage.getItem('hybrid-memo-theme');
      const savedShortcuts = localStorage.getItem('hybrid-memo-shortcuts');
      if (savedNotes)  setNotes(JSON.parse(savedNotes));
      if (savedEvents) setCalendarEvents(JSON.parse(savedEvents));
      if (savedTheme)  setTheme(savedTheme as any);
      if (savedShortcuts) setDesktopShortcuts(JSON.parse(savedShortcuts));
      if (!savedGenres) {
        setGenres([
          { id: crypto.randomUUID(), name: '仕事',       color: '#3b82f6', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: 'プライベート', color: '#22c55e', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: '重要',       color: '#ef4444', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: 'その他',     color: '#6b7280', updatedAt: Date.now() },
        ]);
      } else {
        setGenres(JSON.parse(savedGenres));
      }
      void savedWidth;
    } catch (e) { console.warn('Failed to load from localStorage', e); }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('hybrid-memo-notes', JSON.stringify(notes));
    localStorage.setItem('hybrid-memo-theme', theme);
    localStorage.setItem('hybrid-memo-shortcuts', JSON.stringify(desktopShortcuts));
  }, [notes, isLoaded, theme, desktopShortcuts]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('nemo-calendar-events', JSON.stringify(calendarEvents));
    localStorage.setItem('nemo-calendar-genres', JSON.stringify(genres));
  }, [calendarEvents, genres, isLoaded]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.reload();
  };

  // ── Note CRUD ────────────────────────────────────────────────────────────
  const handleDailySave = async () => {
    if (!dailyContent.trim()) return;
    const today = getTodayString();
    const [yyyy, mm, dd] = today.split('-');
    let updatedNotes = [...notes];
    const yearNode  = getOrCreateFolder(updatedNotes, yyyy, null);
    const monthNode = getOrCreateFolder(updatedNotes, mm, yearNode.id);
    const newNote: Note = {
      id: crypto.randomUUID(), title: dd, content: dailyContent,
      parentId: monthNode.id, updatedAt: Date.now(), type: 'daily', color: dailyColor,
    };
    updatedNotes.push(newNote);
    setNotes(updatedNotes);
    if (user) {
      const toUpsert = [yearNode, monthNode, newNote].map(n => ({ ...n, user_id: user.id }));
      await supabase.from('notes').upsert(toUpsert);
    }
    setDailyContent('');
  };

  const handleCreateNewNote = async (type: 'document' | 'board' = 'document', parentId?: string | null) => {
    const actualParentId = parentId !== undefined ? parentId : null;
    const siblings = notes.filter(n => n.parentId === actualParentId);
    const maxOrder = siblings.reduce((max, n) => Math.max(max, n.order_index ?? 0), 0);
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: type === 'board' ? '無題のボード' : '無題のノート',
      content: type === 'board' ? JSON.stringify({ strokes: [], nodes: [], edges: [] }) : '',
      parentId: actualParentId, updatedAt: Date.now(), type,
      order_index: siblings.length > 0 ? maxOrder + 100 : 0,
    };
    setNotes(prev => [...prev, newNote]);
    if (user) await supabase.from('notes').upsert({ ...newNote, user_id: user.id });
    openWindow(newNote.id, newNote.title, type);
    return newNote;
  };

  const handleUpdateTitle = async (id: string, title: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, title, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    updateWindowTitle(id, title || '無題');
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const handleUpdateContent = async (id: string, content: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, content, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const updateNoteColor = async (id: string, color: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, color, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const handleMoveNote = async (id: string, newParentId: string | null, targetId?: string, position?: 'above' | 'below' | 'inside') => {
    const noteToMove = notes.find(n => n.id === id);
    if (!noteToMove) return;

    let finalParentId = newParentId;

    if (targetId && position && position !== 'inside') {
      const targetNote = notes.find(n => n.id === targetId);
      if (targetNote) finalParentId = targetNote.parentId;
    }

    // 兄弟要素を取得（移動するノート自身は除外してソート）
    const siblings = notes.filter(n => n.parentId === finalParentId && n.id !== id && !n.is_deleted)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    // 挿入位置を決定
    let insertIndex = siblings.length;
    if (targetId && position && position !== 'inside') {
      const targetIndex = siblings.findIndex(n => n.id === targetId);
      if (targetIndex !== -1) {
        insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
      }
    }

    // 新しい配列に挿入
    const newSiblings = [...siblings];
    newSiblings.splice(insertIndex, 0, noteToMove);

    // すべての兄弟要素の order_index を再割り当て（100間隔で整数化し、少数や重複のバグを防ぐ）
    const now = Date.now();
    const updates = newSiblings.map((n, idx) => ({
      ...n,
      parentId: finalParentId,
      order_index: idx * 100,
      updatedAt: now
    }));

    // ローカルステートを更新
    setNotes(prev => {
      const updatedMap = new Map(updates.map(u => [u.id, u]));
      return prev.map(n => updatedMap.has(n.id) ? updatedMap.get(n.id)! : n);
    });

    // データベースを更新（更新対象が複数のため配列でupsert）
    if (user) {
      const dbUpdates = updates.map(u => ({ ...u, user_id: user.id }));
      const { error } = await supabase.from('notes').upsert(dbUpdates);
      if (error) setLastError(`Move note error: ${error.message}`);
    }
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('このノートを削除しますか？紐づく子ノートも全て削除されます。')) return;
    const idsToDelete = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      notes.filter(n => n.parentId === current).forEach(n => { idsToDelete.add(n.id); queue.push(n.id); });
    }
    const idArray = Array.from(idsToDelete);
    const now = Date.now();
    setNotes(prev => prev.map(n => idsToDelete.has(n.id) ? { ...n, is_deleted: true, updatedAt: now } : n));
    if (user) {
      const updates = idArray.map(id => { const note = notes.find(n => n.id === id); return { ...note, id, is_deleted: true, updatedAt: now, user_id: user.id }; });
      const { error } = await supabase.from('notes').upsert(updates);
      if (error) setLastError(`Delete note error: ${error.message}`);
    }
    idsToDelete.forEach(did => closeWindow(did));
  };

  const handleUpdateEmoji = (id: string, emoji: string) => {
    const now = Date.now();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, emoji, updatedAt: now } : n));
    if (user) {
      const note = notes.find(n => n.id === id);
      if (note) supabase.from('notes').upsert({ ...note, emoji, updatedAt: now, user_id: user.id }).then(({ error }) => {
        if (error) setLastError(`Emoji update error: ${error.message}`);
      });
    }
  };

  const isDescendant = (nodeId: string, targetId: string): boolean => {
    let currentId: string | null = targetId;
    while (currentId !== null) {
      if (currentId === nodeId) return true;
      currentId = notes.find(n => n.id === currentId)?.parentId ?? null;
    }
    return false;
  };

  // ── Computed ─────────────────────────────────────────────────────────────
  const todayTitle = getTodayString();
  const [yyyy, mm, dd] = todayTitle.split('-');
  const yearFolder  = notes.find(n => n.parentId === null && n.title === yyyy && !n.is_deleted);
  const monthFolder = yearFolder ? notes.find(n => n.parentId === yearFolder.id && n.title === mm && !n.is_deleted) : null;
  const hasWrittenToday = monthFolder ? notes.some(n => n.parentId === monthFolder.id && (n.title === dd || n.title === todayTitle) && !n.is_deleted) : false;
  const rootNotes = notes.filter(n => n.parentId === null && !n.is_deleted);

  const openOrCreateDailyNote = (dateStr: string) => {
    const [y, mo, d] = dateStr.split('-');
    const yf = notes.find(n => n.parentId === null && n.title === y && !n.is_deleted);
    const mf = yf ? notes.find(n => n.parentId === yf.id && n.title === mo && !n.is_deleted) : null;
    const existing = mf ? notes.find(n => n.parentId === mf.id && (n.title === d || n.title === dateStr) && !n.is_deleted) : null;
    if (existing) { openWindow(existing.id, existing.title, 'daily'); return; }
    let updatedNotes = [...notes];
    const yearNode  = getOrCreateFolder(updatedNotes, y, null);
    const monthNode = getOrCreateFolder(updatedNotes, mo, yearNode.id);
    const newNote: Note = { id: crypto.randomUUID(), title: d, content: '', parentId: monthNode.id, updatedAt: Date.now(), type: 'daily' };
    updatedNotes.push(newNote);
    setNotes(updatedNotes);
    openWindow(newNote.id, newNote.title, 'daily');
  };

  return {
    notes: notes.filter(n => !n.is_deleted),
    setNotes,
    dailyContent, setDailyContent,
    dailyColor, setDailyColor,
    isLoaded, user, lastError,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    draggedNodeId, setDraggedNodeId,
    calendarEvents: calendarEvents.filter(e => !e.is_deleted),
    genres: genres.filter(g => !g.is_deleted),
    setCalendarEvents: async (events: CalendarEvent[]) => {
      setCalendarEvents(events);
      if (user) await supabase.from('calendar_events').upsert(events.map(e => ({ ...e, user_id: user.id })));
    },
    handleDeleteEvent: async (id: string, date?: string, mode: 'only' | 'following' | 'all' = 'all') => {
      const target = calendarEvents.find(e => e.id === id);
      if (!target) return;
      const now = Date.now();
      if (mode === 'all') {
        const updated = { ...target, is_deleted: true, updatedAt: now };
        setCalendarEvents(prev => prev.map(e => e.id === id ? updated : e));
        if (user) { const { error } = await supabase.from('calendar_events').upsert({ ...updated, user_id: user.id }); if (error) setLastError(`Delete event error: ${error.message}`); }
      } else if (mode === 'only' && date) {
        const updated = { ...target, excludedDates: [...(target.excludedDates || []), date], updatedAt: Date.now() };
        setCalendarEvents(prev => prev.map(e => e.id === id ? updated : e));
        if (user) await supabase.from('calendar_events').upsert({ ...updated, user_id: user.id });
      } else if (mode === 'following' && date) {
        const updated = { ...target, recurrence: target.recurrence ? { ...target.recurrence, endType: 'date' as const, endDate: date } : undefined, updatedAt: Date.now() };
        setCalendarEvents(prev => prev.map(e => e.id === id ? updated : e));
        if (user) await supabase.from('calendar_events').upsert({ ...updated, user_id: user.id });
      }
    },
    setGenres: async (newGenres: Genre[]) => {
      setGenres(newGenres);
      if (user) await supabase.from('genres').upsert(newGenres.map(g => ({ ...g, user_id: user.id })));
    },
    handleDeleteGenre: async (id: string) => {
      const now = Date.now();
      setGenres(prev => prev.map(g => g.id === id ? { ...g, is_deleted: true, updatedAt: now } : g));
      if (user) {
        const target = genres.find(g => g.id === id);
        const { error } = await supabase.from('genres').upsert({ ...target, id, is_deleted: true, updatedAt: now, user_id: user.id });
        if (error) setLastError(`Delete genre error: ${error.message}`);
      }
    },
    theme, setTheme,
    handleLogout,
    // window system
    windows, activeWindowId,
    openWindow, closeWindow, minimizeWindow, maximizeWindow, toggleWindow,
    focusWindow, moveWindow, resizeWindow,
    // note handlers
    handleDailySave, handleCreateNewNote,
    handleUpdateTitle, handleUpdateContent, handleDeleteNote,
    handleMoveNote, updateNoteColor, handleUpdateEmoji,
    isDescendant, openOrCreateDailyNote,
    // computed
    todayTitle, hasWrittenToday, rootNotes,
    desktopShortcuts, setDesktopShortcuts,
    // legacy compat (used inside handlers)
    activateNote: openWindow,
  };
}
