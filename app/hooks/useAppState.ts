"use client";

import { useState, useEffect, useRef } from "react";
import { Note, Tab, CalendarEvent, Genre } from "../types";
import { getTodayString } from "../lib/utils";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

// ── 共有ヘルパー: 年/月フォルダをin-placeで検索または作成 ──────────────────
function getOrCreateFolder(updatedNotes: Note[], title: string, parentId: string | null): Note {
  let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title);
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

  // ── 同期強化: 削除済みIDの追跡 ──────────────────────────────────────────────
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const deletionsRef = useRef<Set<string>>(new Set());

  // pendingDeletions（ステート）が変わったら Ref も更新して最新値を維持
  useEffect(() => {
    deletionsRef.current = new Set(pendingDeletions);
  }, [pendingDeletions]);

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

    // 削除待機中のIDをセットにする（検索用）
    const deletedSet = deletionsRef.current;

    setNotes(current => {
      // リモートから降ってきたデータのうち、削除待機中のものは除外する
      const filteredRemote = remoteNotes.filter(rn => !deletedSet.has(rn.id));
      const merged = [...current.filter(n => !deletedSet.has(n.id))];

      filteredRemote.forEach(rn => {
        const idx = merged.findIndex(n => n.id === rn.id);
        if (idx === -1) merged.push(rn);
        else if (rn.updatedAt > merged[idx].updatedAt) merged[idx] = rn;
      });
      // ローカルにあってリモートにない、またはローカルの方が新しいものをプッシュ
      const toPush = merged.filter(n => !filteredRemote.find(rn => rn.id === n.id) || n.updatedAt > (filteredRemote.find(rn => rn.id === n.id)?.updatedAt || 0));
      if (toPush.length > 0) supabase.from('notes').upsert(toPush.map(n => ({ ...n, user_id: currentUser.id }))).then();
      return merged;
    });

    setCalendarEvents(current => {
      const filteredRemote = remoteEvents.filter(re => !deletedSet.has(re.id));
      const merged = [...current.filter(e => !deletedSet.has(e.id))];

      filteredRemote.forEach(re => {
        const idx = merged.findIndex(e => e.id === re.id);
        if (idx === -1) merged.push(re);
        else if (re.updatedAt > merged[idx].updatedAt) merged[idx] = re;
      });
      const toPush = merged.filter(e => !filteredRemote.find(re => re.id === e.id) || e.updatedAt > (filteredRemote.find(re => re.id === e.id)?.updatedAt || 0));
      if (toPush.length > 0) supabase.from('calendar_events').upsert(toPush.map(e => ({ ...e, user_id: currentUser.id }))).then();
      return merged;
    });

    setGenres(current => {
      const filteredRemote = remoteGenres.filter(rg => !deletedSet.has(rg.id));
      const merged = [...current.filter(g => !deletedSet.has(g.id))];

      filteredRemote.forEach(rg => {
        const idx = merged.findIndex(g => g.id === rg.id);
        if (idx === -1) merged.push(rg);
        else if (rg.updatedAt > merged[idx].updatedAt) merged[idx] = rg;
      });
      const toPush = merged.filter(g => !filteredRemote.find(rg => rg.id === g.id) || g.updatedAt > (filteredRemote.find(rg => rg.id === g.id)?.updatedAt || 0));
      if (toPush.length > 0) supabase.from('genres').upsert(toPush.map(g => ({ ...g, user_id: currentUser.id }))).then();
      return merged;
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as Note;
          setNotes(current => {
            if (deletionsRef.current.has(newData.id)) return current; // 削除中なら無視
            const idx = current.findIndex(n => n.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current];
              next[idx] = newData;
              return next;
            }
            return current;
          });
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as any).id;
          setNotes(current => current.filter(n => n.id !== oldId));
        }
      })
      // カレンダーイベントの監視
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as CalendarEvent;
          setCalendarEvents(current => {
            if (deletionsRef.current.has(newData.id)) return current;
            const idx = current.findIndex(e => e.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current];
              next[idx] = newData;
              return next;
            }
            return current;
          });
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as any).id;
          setCalendarEvents(current => current.filter(e => e.id !== oldId));
        }
      })
      // ジャンルの監視
      .on('postgres_changes', { event: '*', schema: 'public', table: 'genres' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = payload.new as Genre;
          setGenres(current => {
            if (deletionsRef.current.has(newData.id)) return current;
            const idx = current.findIndex(g => g.id === newData.id);
            if (idx === -1) return [...current, newData];
            if (newData.updatedAt > (current[idx].updatedAt || 0)) {
              const next = [...current];
              next[idx] = newData;
              return next;
            }
            return current;
          });
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as any).id;
          setGenres(current => current.filter(g => g.id !== oldId));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ── 削除クリーナー（バックグラウンドで削除リトライ） ─────────────────────────
  useEffect(() => {
    if (!user || pendingDeletions.length === 0) return;

    const cleanup = async () => {
      const ids = [...pendingDeletions];
      // Supabaseの全テーブルに対して一括削除を試みる
      const results = await Promise.all([
        supabase.from('notes').delete().in('id', ids),
        supabase.from('calendar_events').delete().in('id', ids),
        supabase.from('genres').delete().in('id', ids),
      ]);

      const hasError = results.some(r => r.error);
      if (!hasError) {
        // 削除に成功したIDのみをリストから除外する
        setPendingDeletions(prev => prev.filter(id => !ids.includes(id)));
      }
    };

    const timer = setTimeout(cleanup, 3000); // 3秒おきにチェック
    return () => clearTimeout(timer);
  }, [user, pendingDeletions]);

  // ── localStorage 初期ロード ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const savedNotes  = localStorage.getItem('hybrid-memo-notes');
      const savedTabs   = localStorage.getItem('hybrid-memo-tabs');
      const savedWidth  = localStorage.getItem('hybrid-memo-sidebar-width');
      const savedEvents = localStorage.getItem('nemo-calendar-events');
      const savedGenres = localStorage.getItem('nemo-calendar-genres');
      const savedTheme  = localStorage.getItem('hybrid-memo-theme');
      const savedDeletes = localStorage.getItem('nemo-pending-deletes');

      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedTabs) {
        const { openedTabs: tabs, activeTabId: tabId } = JSON.parse(savedTabs);
        if (tabs) setOpenedTabs(tabs);
        if (tabId !== undefined) setActiveTabId(tabId);
      }
      if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));
      if (savedEvents) setCalendarEvents(JSON.parse(savedEvents));
      if (savedTheme) setTheme(savedTheme as any);
      if (savedDeletes) setPendingDeletions(JSON.parse(savedDeletes));

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
    localStorage.setItem('nemo-pending-deletes', JSON.stringify(pendingDeletions));
  }, [notes, isLoaded, openedTabs, activeTabId, sidebarWidth, theme, pendingDeletions]);

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
  const handleCreateNewNote = async (type: 'document' | 'board' = 'document') => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title:   type === 'board' ? '無題のボード' : '無題のノート',
      content: type === 'board' ? JSON.stringify({ strokes: [], nodes: [], edges: [] }) : '',
      parentId: activeTabId && activeTabId !== '__calendar__' ? activeTabId : null,
      updatedAt: Date.now(),
      type,
    };
    setNotes(prev => [...prev, newNote]);
    if (user) await supabase.from('notes').upsert({ ...newNote, user_id: user.id });
    activateNote(newNote.id, newNote.title);
  };

  // ── タイトル / コンテンツ更新 ───────────────────────────────────────────────
  const handleUpdateTitle = async (title: string) => {
    const note = notes.find(n => n.id === activeTabId);
    if (!note) return;
    const updated = { ...note, title, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === activeTabId ? updated : n)));
    setOpenedTabs(prev => prev.map(t => (t.id === activeTabId ? { ...t, title: title || '無題' } : t)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const handleUpdateContent = async (content: string) => {
    const note = notes.find(n => n.id === activeTabId);
    if (!note) return;
    const updated = { ...note, content, updatedAt: Date.now() };
    setNotes(prev => prev.map(n => (n.id === activeTabId ? updated : n)));
    if (user) await supabase.from('notes').upsert({ ...updated, user_id: user.id });
  };

  const updateNoteColor = async (id: string, color: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, color, updatedAt: Date.now() };
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

    setNotes(prev => prev.filter(n => !idsToDelete.has(n.id)));
    
    const idArray = Array.from(idsToDelete);
    setPendingDeletions(prev => [...new Set([...prev, ...idArray])]);
    if (user) await supabase.from('notes').delete().in('id', idArray);

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

  const yearFolder  = notes.find(n => n.parentId === null && n.title === yyyy);
  const monthFolder = yearFolder
    ? notes.find(n => n.parentId === yearFolder.id && n.title === mm)
    : null;
  const hasWrittenToday = monthFolder
    ? notes.some(n => n.parentId === monthFolder.id && (n.title === dd || n.title === todayTitle))
    : false;

  const isCalendarTab = activeTabId === '__calendar__';
  const activeNote  = activeTabId && !isCalendarTab ? notes.find(n => n.id === activeTabId) ?? null : null;
  const rootNotes   = notes.filter(n => n.parentId === null);
  const childNotes  = activeTabId && !isCalendarTab ? notes.filter(n => n.parentId === activeTabId) : [];

  // ── デイリーノートを開く or 作成 ────────────────────────────────────────────
  const openOrCreateDailyNote = (dateStr: string) => {
    const [yyyy, mm, dd] = dateStr.split('-');

    const findNote = (currentNotes: Note[]) => {
      const yearFolder  = currentNotes.find(n => n.parentId === null && n.title === yyyy);
      if (!yearFolder) return null;
      const monthFolder = currentNotes.find(n => n.parentId === yearFolder.id && n.title === mm);
      if (!monthFolder) return null;
      return currentNotes.find(n => n.parentId === monthFolder.id && (n.title === dd || n.title === dateStr)) ?? null;
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
    notes, setNotes,
    dailyContent, setDailyContent,
    dailyColor, setDailyColor,
    isLoaded, user,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    openedTabs, activeTabId,
    draggedNodeId, setDraggedNodeId,
    sidebarWidth, isResizing, setIsResizing,
    calendarEvents,
    setCalendarEvents: async (events: CalendarEvent[]) => {
      // 注意: この関数は更新のみを扱うように整理
      setCalendarEvents(events);
      if (user) await supabase.from('calendar_events').upsert(events.map(e => ({ ...e, user_id: user.id })));
    },
    handleDeleteEvent: async (id: string, date?: string, mode: 'only' | 'following' | 'all' = 'all') => {
      const target = calendarEvents.find(e => e.id === id);
      if (!target) return;

      if (mode === 'all') {
        setCalendarEvents(prev => prev.filter(e => e.id !== id));
        setPendingDeletions(prev => [...new Set([...prev, id])]);
        if (user) await supabase.from('calendar_events').delete().eq('id', id);
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
    genres,
    setGenres: async (newGenres: Genre[]) => {
      setGenres(newGenres);
      if (user) await supabase.from('genres').upsert(newGenres.map(g => ({ ...g, user_id: user.id })));
    },
    handleDeleteGenre: async (id: string) => {
      setGenres(prev => prev.filter(g => g.id !== id));
      setPendingDeletions(prev => [...new Set([...prev, id])]);
      if (user) await supabase.from('genres').delete().eq('id', id);
    },
    theme, setTheme,
    handleLogout,
    // handlers
    activateNote, closeTab,
    handleDailySave, handleCreateNewNote,
    handleUpdateTitle, handleUpdateContent, handleDeleteNote,
    updateNoteColor,
    isDescendant,
    openOrCreateDailyNote,
    // computed
    todayTitle, hasWrittenToday,
    shouldShowDailyEditor: activeTabId === null && !hasWrittenToday,
    activeNote, rootNotes, childNotes,
  };
}
