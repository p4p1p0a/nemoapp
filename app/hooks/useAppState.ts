"use client";

import { useState, useEffect, useRef } from "react";
import { Note, Tab, CalendarEvent, Genre } from "../types";
import { getTodayString } from "../lib/utils";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

// ── 共有ヘルパー: 年/月フォルダをin-placeで検索または作成 ──────────────────
function getOrCreateFolder(updatedNotes: Note[], title: string, parentId: string | null): Note {
  let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title && !n.is_deleted);
  if (!folder) {
    folder = { id: crypto.randomUUID(), title, content: '', parentId, updatedAt: Date.now() };
    updatedNotes.push(folder);
  }
  return folder;
}

export function useAppState() {
  // ── ノート ──────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const [dailyContent, setDailyContent] = useState('');
  const [dailyColor, setDailyColor] = useState('#3b82f6');
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activePanel, setActivePanel] = useState<'files' | null>('files');

  // ── タブ ────────────────────────────────────────────────────────────────────
  const [openedTabs, setOpenedTabs] = useState<Tab[]>([{ id: null, title: 'WORKSPACE' }]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // ── D&D ─────────────────────────────────────────────────────────────────────
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // ── サイドバーリサイズ ──────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  // ── カレンダーイベント ─────────────────────────────────────────────────────
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  // ── デザインテーマ ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light' | 'nord' | 'sepia'>('dark');

  // リサイズマウスイベント
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      setSidebarWidth(Math.min(Math.max(e.clientX, 150), 800));
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
    // データの取得
    const { remoteNotes, remoteEvents, remoteGenres } = await fetchAllFromSupabase(currentUser.id);

    setNotes(current => {
      const merged = [...current];
      remoteNotes.forEach(rn => {
        const idx = merged.findIndex(n => n.id === rn.id);
        if (idx === -1) merged.push(rn);
        else if (rn.updatedAt > merged[idx].updatedAt) merged[idx] = rn;
      });

      // 同期が必要な項目をプッシュ
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
      if (error) {
        // リフレッシュトークン期限切れ等の場合は静かにサインアウトしてローカルセッションをクリア
        console.warn('[Auth] セッション取得失敗、ローカルセッションをクリアします:', error.message);
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        return;
      }
      setUser(session?.user ?? null);
      if (session?.user) syncData(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) syncData(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── リアルタイム同期（リスナー） ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('realtime-sync')
      // ノートの監視
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, (payload) => {
        const newData = payload.new as Note;
        setNotes(current => {
          const idx = current.findIndex(n => n.id === newData.id);
          if (idx !== -1) return current; // 既に存在する
          return [...current, newData];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, (payload) => {
        const newData = payload.new as Note;
        setNotes(current => {
          const idx = current.findIndex(n => n.id === newData.id);
          if (idx === -1) return [...current, newData];
          if (newData.updatedAt > (current[idx].updatedAt || 0)) {
            const next = [...current];
            next[idx] = newData;
            return next;
          }
          return current;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, (payload) => {
        // 他デバイスで削除されたノートをリアルタイムで除去
        const deletedId = (payload.old as { id?: string }).id;
        if (deletedId) setNotes(current => current.filter(n => n.id !== deletedId));
      })
      // カレンダーイベントの監視
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as CalendarEvent;
          setCalendarEvents(current => {
            const idx = current.findIndex(e => e.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current];
              next[idx] = newData;
              return next;
            }
            return current;
          });
        }
      })
      // ジャンルの監視
      .on('postgres_changes', { event: '*', schema: 'public', table: 'genres' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as Genre;
          setGenres(current => {
            const idx = current.findIndex(g => g.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current];
              next[idx] = newData;
              return next;
            }
            return current;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ── 削除クリーナー（不要になったため削除） ──────────────────────────────────

  // ── localStorage 初期ロード ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const savedNotes  = localStorage.getItem('hybrid-memo-notes');
      const savedTabs   = localStorage.getItem('hybrid-memo-tabs');
      const savedWidth  = localStorage.getItem('hybrid-memo-sidebar-width');
      const savedEvents = localStorage.getItem('nemo-calendar-events');
      const savedGenres = localStorage.getItem('nemo-calendar-genres');
      const savedTheme  = localStorage.getItem('hybrid-memo-theme');

      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedTabs) {
        const { openedTabs: tabs, activeTabId: tabId } = JSON.parse(savedTabs);
        if (tabs) setOpenedTabs(tabs);
        if (tabId !== undefined) setActiveTabId(tabId);
      }
      if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));
      if (savedEvents) setCalendarEvents(JSON.parse(savedEvents));
      if (savedTheme) setTheme(savedTheme as any);

      if (savedGenres) {
        setGenres(JSON.parse(savedGenres));
      } else {
        // デフォルトのジャンル
        const defaults: Genre[] = [
          { id: crypto.randomUUID(), name: '仕事', color: '#3b82f6', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: 'プライベート', color: '#22c55e', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: '重要', color: '#ef4444', updatedAt: Date.now() },
          { id: crypto.randomUUID(), name: 'その他', color: '#6b7280', updatedAt: Date.now() },
        ];
        setGenres(defaults);
      }
    } catch (e) {
      console.warn('Failed to load from localStorage', e);
    }
    setIsLoaded(true);
  }, []);

  // ── localStorage 保存 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('hybrid-memo-notes', JSON.stringify(notes));
    localStorage.setItem('hybrid-memo-tabs', JSON.stringify({ openedTabs, activeTabId }));
    localStorage.setItem('hybrid-memo-sidebar-width', sidebarWidth.toString());
    localStorage.setItem('hybrid-memo-theme', theme);
  }, [notes, isLoaded, openedTabs, activeTabId, sidebarWidth, theme]);

  // カレンダーイベントを独立したエフェクトで保存（ノートと同期）
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('nemo-calendar-events', JSON.stringify(calendarEvents));
    localStorage.setItem('nemo-calendar-genres', JSON.stringify(genres));
  }, [calendarEvents, genres, isLoaded]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear(); // 簡易的にローカルキャッシュも消去（お試し用）
    window.location.reload();
  };

  // ── タブ操作 ────────────────────────────────────────────────────────────────
  const activateNote = (id: string | null, fallbackTitle: string = 'WORKSPACE') => {
    const title =
      id === null           ? 'WORKSPACE' :
      id === '__calendar__' ? '📅 カレンダー' :
      (notes.find(n => n.id === id)?.title || fallbackTitle || '無題');
    setOpenedTabs(prev => {
      if (!prev.find(t => t.id === id)) return [...prev, { id, title }];
      return prev.map(t => (t.id === id ? { ...t, title } : t));
    });
    setActiveTabId(id);
  };

  const closeTab = (e: React.MouseEvent, id: string | null) => {
    e.stopPropagation();
    setOpenedTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (id === activeTabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
      }
      return newTabs.length === 0 ? [{ id: null, title: 'WORKSPACE' }] : newTabs;
    });
  };

  // ── デイリーノート保存 ──────────────────────────────────────────────────────
  const handleDailySave = async () => {
    if (!dailyContent.trim()) return;
    const today = getTodayString();
    const [yyyy, mm, dd] = today.split('-');
    let updatedNotes = [...notes];
    const yearNode  = getOrCreateFolder(updatedNotes, yyyy, null);
    const monthNode = getOrCreateFolder(updatedNotes, mm, yearNode.id);
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: dd,
      content: dailyContent,
      parentId: monthNode.id,
      updatedAt: Date.now(),
      type: 'daily',
      color: dailyColor,
    };
    updatedNotes.push(newNote);
    setNotes(updatedNotes);

    if (user) {
      // フォルダ構造も一緒にアップロード
      const toUpsert = [yearNode, monthNode, newNote].map(n => ({ ...n, user_id: user.id }));
      await supabase.from('notes').upsert(toUpsert);
    }

    setDailyContent('');
    activateNote(null);
  };

  // ── 新規ノート作成 ──────────────────────────────────────────────────────────
  const handleCreateNewNote = async (type: 'document' | 'board' = 'document', parentId?: string | null) => {
    const actualParentId = parentId !== undefined ? parentId : (activeTabId && activeTabId !== '__calendar__' ? activeTabId : null);
    const newNote: Note = {
      id: crypto.randomUUID(),
      title:   type === 'board' ? '無題のボード' : '無題のノート',
      content: type === 'board' ? JSON.stringify({ strokes: [], nodes: [], edges: [] }) : '',
      parentId: actualParentId,
      updatedAt: Date.now(),
      type,
    };
    setNotes(prev => [...prev, newNote]);
    if (user) await supabase.from('notes').upsert({ ...newNote, user_id: user.id });
    activateNote(newNote.id, newNote.title);
    return newNote;
  };

  // ── タイトル / コンテンツ更新 ───────────────────────────────────────────────
  const handleUpdateTitle = async (id: string, title: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, title, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === id ? updated : n)));
    // タブのタイトルも更新
    setOpenedTabs(prev => prev.map(t => (t.id === id ? { ...t, title: title || '無題' } : t)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const handleUpdateContent = async (id: string, content: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, content, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === id ? updated : n)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const updateNoteColor = async (id: string, color: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, color, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === id ? updated : n)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const handleMoveNote = async (id: string, newParentId: string | null) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, parentId: newParentId, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === id ? updated : n)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  // ── 再帰削除 ────────────────────────────────────────────────────────────────
  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('このノートを削除しますか？紐づく子ノートも全て削除されます。')) return;

    const idsToDelete = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      notes.filter(n => n.parentId === current).forEach(n => {
        idsToDelete.add(n.id);
        queue.push(n.id);
      });
    }

    const idArray = Array.from(idsToDelete);
    const now = Date.now();

    // ローカル状態を論理削除（is_deleted: true）に更新
    setNotes(prev => prev.map(n => idsToDelete.has(n.id) ? { ...n, is_deleted: true, updatedAt: now } : n));

    // Supabase に論理削除を反映 (upsert)
    if (user) {
      const updates = idArray.map(id => {
        const note = notes.find(n => n.id === id);
        return { ...note, id, is_deleted: true, updatedAt: now, user_id: user.id };
      });
      const { error } = await supabase.from('notes').upsert(updates);
      if (error) setLastError(`Delete note error: ${error.message}`);
    }

    let shouldGoHome = false;
    setOpenedTabs(prev => {
      const newTabs = prev.filter(t => t.id === null || !idsToDelete.has(t.id));
      if (activeTabId && idsToDelete.has(activeTabId)) shouldGoHome = true;
      return newTabs.length === 0 ? [{ id: null, title: 'WORKSPACE' }] : newTabs;
    });
    if (shouldGoHome || (activeTabId && idsToDelete.has(activeTabId))) {
      setActiveTabId(null);
    }
  };

  // ── D&D 循環チェック ────────────────────────────────────────────────────────
  const isDescendant = (nodeId: string, targetId: string): boolean => {
    let currentId: string | null = targetId;
    while (currentId !== null) {
      if (currentId === nodeId) return true;
      currentId = notes.find(n => n.id === currentId)?.parentId ?? null;
    }
    return false;
  };

  // ── Computed ────────────────────────────────────────────────────────────────
  const todayTitle = getTodayString();
  const [yyyy, mm, dd] = todayTitle.split('-');

  const yearFolder  = notes.find(n => n.parentId === null && n.title === yyyy && !n.is_deleted);
  const monthFolder = yearFolder
    ? notes.find(n => n.parentId === yearFolder.id && n.title === mm && !n.is_deleted)
    : null;
  const hasWrittenToday = monthFolder
    ? notes.some(n => n.parentId === monthFolder.id && (n.title === dd || n.title === todayTitle) && !n.is_deleted)
    : false;

  const isCalendarTab = activeTabId === '__calendar__';
  const activeNote  = activeTabId && !isCalendarTab ? notes.find(n => n.id === activeTabId && !n.is_deleted) ?? null : null;
  const rootNotes   = notes.filter(n => n.parentId === null && !n.is_deleted);
  const childNotes  = activeTabId && !isCalendarTab ? notes.filter(n => n.parentId === activeTabId && !n.is_deleted) : [];

  // ── デイリーノートを開く or 作成 ────────────────────────────────────────────
  const openOrCreateDailyNote = (dateStr: string) => {
    const [yyyy, mm, dd] = dateStr.split('-');

    const findNote = (currentNotes: Note[]) => {
      const yearFolder  = currentNotes.find(n => n.parentId === null && n.title === yyyy && !n.is_deleted);
      if (!yearFolder) return null;
      const monthFolder = currentNotes.find(n => n.parentId === yearFolder.id && n.title === mm && !n.is_deleted);
      if (!monthFolder) return null;
      return currentNotes.find(n => n.parentId === monthFolder.id && (n.title === dd || n.title === dateStr) && !n.is_deleted) ?? null;
    };

    const existing = findNote(notes);
    if (existing) {
      setActivePanel('files');
      activateNote(existing.id, existing.title);
      return;
    }

    let updatedNotes = [...notes];
    const yearNode  = getOrCreateFolder(updatedNotes, yyyy, null);
    const monthNode = getOrCreateFolder(updatedNotes, mm, yearNode.id);
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: dd,
      content: '',
      parentId: monthNode.id,
      updatedAt: Date.now(),
      type: 'daily',
    };
    updatedNotes.push(newNote);
    setNotes(updatedNotes);
    setActivePanel('files');
    setOpenedTabs(prev => [...prev, { id: newNote.id, title: newNote.title }]);
    setActiveTabId(newNote.id);
  };

  return {
    // state
    notes: notes.filter(n => !n.is_deleted),
    setNotes,
    dailyContent, setDailyContent,
    dailyColor, setDailyColor,
    isLoaded, user, lastError,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    openedTabs, activeTabId,
    draggedNodeId, setDraggedNodeId,
    sidebarWidth, isResizing, setIsResizing,
    calendarEvents: calendarEvents.filter(e => !e.is_deleted),
    genres: genres.filter(g => !g.is_deleted),
    setCalendarEvents: async (events: CalendarEvent[]) => {
      // 注意: この関数は更新のみを扱うように整理
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
        if (user) {
          const { error } = await supabase.from('calendar_events').upsert({ ...updated, user_id: user.id });
          if (error) setLastError(`Delete event error: ${error.message}`);
        }
      } else if (mode === 'only' && date) {
        const excluded = target.excludedDates || [];
        const updated = { ...target, excludedDates: [...excluded, date], updatedAt: Date.now() };
        setCalendarEvents(prev => prev.map(e => e.id === id ? updated : e));
        if (user) await supabase.from('calendar_events').upsert({ ...updated, user_id: user.id });
      } else if (mode === 'following' && date) {
        const updated = { 
          ...target, 
          recurrence: target.recurrence ? { 
            ...target.recurrence, 
            endType: 'date' as const, 
            endDate: date 
          } : undefined, 
          updatedAt: Date.now() 
        };
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
    // handlers
    activateNote, closeTab,
    handleDailySave, handleCreateNewNote,
    handleUpdateTitle, handleUpdateContent, handleDeleteNote,
    handleMoveNote, updateNoteColor,
    isDescendant,
    openOrCreateDailyNote,
    // computed
    todayTitle, hasWrittenToday,
    shouldShowDailyEditor: activeTabId === null && !hasWrittenToday,
    activeNote, rootNotes, childNotes,
  };
}
