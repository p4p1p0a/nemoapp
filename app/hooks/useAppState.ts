"use client";

import { useState, useEffect } from "react";
import { Note, Tab } from "../types";
import { getTodayString } from "../lib/utils";

export function useAppState() {
  // ── ノート ──────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const [dailyContent, setDailyContent] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [activePanel, setActivePanel] = useState<"files" | "calendar" | null>("files");

  // ── タブ ────────────────────────────────────────────────────────────────────
  const [openedTabs, setOpenedTabs] = useState<Tab[]>([{ id: null, title: "WORKSPACE" }]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // ── D&D ─────────────────────────────────────────────────────────────────────
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // ── サイドバーリサイズ ──────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  // リサイズマウスイベント
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      setSidebarWidth(Math.min(Math.max(e.clientX, 150), 800));
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // ── localStorage 初期ロード ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem("hybrid-memo-notes");
      const savedTabs  = localStorage.getItem("hybrid-memo-tabs");
      const savedWidth = localStorage.getItem("hybrid-memo-sidebar-width");
      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedTabs) {
        const { openedTabs: tabs, activeTabId: tabId } = JSON.parse(savedTabs);
        if (tabs) setOpenedTabs(tabs);
        if (tabId !== undefined) setActiveTabId(tabId);
      }
      if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));
    } catch (e) {
      console.warn("Failed to load from localStorage", e);
    }
    setIsLoaded(true);
  }, []);

  // ── localStorage 保存 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("hybrid-memo-notes", JSON.stringify(notes));
    localStorage.setItem("hybrid-memo-tabs", JSON.stringify({ openedTabs, activeTabId }));
    localStorage.setItem("hybrid-memo-sidebar-width", sidebarWidth.toString());
  }, [notes, isLoaded, openedTabs, activeTabId, sidebarWidth]);

  // ── タブ操作 ────────────────────────────────────────────────────────────────
  const activateNote = (id: string | null, fallbackTitle: string = "WORKSPACE") => {
    const title = id === null ? "WORKSPACE" : (notes.find(n => n.id === id)?.title || "無題");
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
      return newTabs.length === 0 ? [{ id: null, title: "WORKSPACE" }] : newTabs;
    });
  };

  // ── デイリーノート保存 ──────────────────────────────────────────────────────
  const handleDailySave = () => {
    if (!dailyContent.trim()) return;
    const dObj = new Date();
    const yyyy = String(dObj.getFullYear());
    const mm   = String(dObj.getMonth() + 1).padStart(2, "0");
    const dd   = String(dObj.getDate()).padStart(2, "0");

    let updatedNotes = [...notes];

    const getOrCreateFolder = (title: string, parentId: string | null): Note => {
      let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title);
      if (!folder) {
        folder = { id: crypto.randomUUID(), title, content: "", parentId, updatedAt: Date.now() };
        updatedNotes.push(folder);
      }
      return folder;
    };

    const yearNode  = getOrCreateFolder(yyyy, null);
    const monthNode = getOrCreateFolder(mm, yearNode.id);
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: dd,
      content: dailyContent,
      parentId: monthNode.id,
      updatedAt: Date.now(),
    };
    updatedNotes.push(newNote);
    setNotes(updatedNotes);
    setDailyContent("");
    activateNote(null);
  };

  // ── 新規ノート作成 ──────────────────────────────────────────────────────────
  const handleCreateNewNote = (type: "document" | "board" = "document") => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title:   type === "board" ? "無題のボード" : "無題のノート",
      content: type === "board" ? JSON.stringify({ strokes: [] }) : "",
      parentId: activeTabId ?? null,
      updatedAt: Date.now(),
      type,
    };
    setNotes(prev => [...prev, newNote]);
    activateNote(newNote.id, newNote.title);
  };

  // ── タイトル / コンテンツ更新 ───────────────────────────────────────────────
  const handleUpdateTitle = (title: string) => {
    setNotes(prev =>
      prev.map(n => (n.id === activeTabId ? { ...n, title, updatedAt: Date.now() } : n))
    );
    setOpenedTabs(prev =>
      prev.map(t => (t.id === activeTabId ? { ...t, title: title || "無題" } : t))
    );
  };

  const handleUpdateContent = (content: string) => {
    setNotes(prev =>
      prev.map(n => (n.id === activeTabId ? { ...n, content, updatedAt: Date.now() } : n))
    );
  };

  // ── 再帰削除 ────────────────────────────────────────────────────────────────
  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このノートを削除しますか？紐づく子ノートも全て削除されます。")) return;

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

    let shouldGoHome = false;
    setOpenedTabs(prev => {
      const newTabs = prev.filter(t => t.id === null || !idsToDelete.has(t.id));
      if (activeTabId && idsToDelete.has(activeTabId)) shouldGoHome = true;
      return newTabs.length === 0 ? [{ id: null, title: "WORKSPACE" }] : newTabs;
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
  const dObj = new Date();
  const yyyy = String(dObj.getFullYear());
  const mm   = String(dObj.getMonth() + 1).padStart(2, "0");
  const dd   = String(dObj.getDate()).padStart(2, "0");

  const yearFolder  = notes.find(n => n.parentId === null && n.title === yyyy);
  const monthFolder = yearFolder
    ? notes.find(n => n.parentId === yearFolder.id && n.title === mm)
    : null;
  const hasWrittenToday = monthFolder
    ? notes.some(n => n.parentId === monthFolder.id && (n.title === dd || n.title === todayTitle))
    : false;

  const activeNote  = activeTabId ? notes.find(n => n.id === activeTabId) ?? null : null;
  const rootNotes   = notes.filter(n => n.parentId === null);
  const childNotes  = activeTabId ? notes.filter(n => n.parentId === activeTabId) : [];

  // ── デイリーノートを開く or 作成 ────────────────────────────────────────────
  const openOrCreateDailyNote = (dateStr: string) => {
    const [yyyy, mm, dd] = dateStr.split('-');

    // 既存のデイリーノートを探す
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

    // 存在しなければ作成
    let updatedNotes = [...notes];
    const getOrCreateFolder = (title: string, parentId: string | null): Note => {
      let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title);
      if (!folder) {
        folder = { id: crypto.randomUUID(), title, content: '', parentId, updatedAt: Date.now() };
        updatedNotes.push(folder);
      }
      return folder;
    };

    const yearNode  = getOrCreateFolder(yyyy, null);
    const monthNode = getOrCreateFolder(mm, yearNode.id);
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
    // activateNote は notes state 更新前に呼ぶので直接 setActiveTabId を使う
    setOpenedTabs(prev => [...prev, { id: newNote.id, title: newNote.title }]);
    setActiveTabId(newNote.id);
  };

  return {
    // state
    notes, setNotes,
    dailyContent, setDailyContent,
    isLoaded,
    searchQuery, setSearchQuery,
    activePanel, setActivePanel,
    openedTabs, activeTabId,
    draggedNodeId, setDraggedNodeId,
    sidebarWidth, isResizing, setIsResizing,
    // handlers
    activateNote, closeTab,
    handleDailySave, handleCreateNewNote,
    handleUpdateTitle, handleUpdateContent, handleDeleteNote,
    isDescendant,
    openOrCreateDailyNote,
    // computed
    todayTitle, hasWrittenToday,
    shouldShowDailyEditor: activeTabId === null && !hasWrittenToday,
    activeNote, rootNotes, childNotes,
  };
}
