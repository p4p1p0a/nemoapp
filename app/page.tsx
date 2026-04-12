"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";

import InfiniteBoard from "./components/InfiniteBoard";

type Note = {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  updatedAt: number;
  type?: 'document' | 'board';
};

type Tab = {
  id: string | null;
  title: string;
};


// YouTubeのURLから動画IDを抽出するヘルパー関数
const extractYouTubeIds = (text: string): string[] => {
  if (!text) return [];
  const ids: string[] = [];
  const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return Array.from(new Set(ids));
};

// オートリサイズ機能を持つテキストエリア
const AutoResizeTextarea = ({ value, onChange, placeholder, autoFocus, onBlur }: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full block bg-transparent border-none text-base outline-none resize-none leading-relaxed text-white/90 placeholder:text-white/20 overflow-hidden min-h-[50px] py-1"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize(); // タイピング中も即座にリサイズ
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
};

// プレーンテキストからURLを抽出してaタグに変換するレンダラー
const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    const parts = line.split(urlRegex);
    return (
      <span key={lineIndex}>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a 
                key={i} 
                href={part} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-400 hover:text-blue-300 underline break-all" 
                onClick={e => e.stopPropagation()} // リンククリック時に編集モードになるのを防ぐ
              >
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
};

// Readモード（リンクがクリック可能）とEditモードを切り替えるハイブリッドブロック
const RichTextBlock = ({ value, onChange, placeholder }: any) => {
  const [isEditing, setIsEditing] = useState(!value); // 空なら最初から編集モード

  if (isEditing) {
    return (
      <AutoResizeTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={true}
        onBlur={() => {
          setIsEditing(false); // フォーカスが外れたらReadモードに戻る
        }}
      />
    );
  }

  return (
    <div 
      className="w-full block bg-transparent border-none text-base outline-none resize-none leading-relaxed text-white/90 min-h-[50px] py-1 cursor-text"
      onClick={() => setIsEditing(true)}
    >
      {value ? renderTextWithLinks(value) : <span className="text-white/20">{placeholder}</span>}
    </div>
  );
};

// インライン埋め込みを可能にするブロックエディタ
const BlockEditor = ({ content, updateContent }: { content: string, updateContent: (c: string) => void }) => {
  // `[YouTube URL]` の形式をブロック分割用として検知
  const regex = /(\[(?:https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/)[a-zA-Z0-9_-]+|https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+)\])/gi;
  const chunks = content.split(regex);

  const handleUpdateChunk = (index: number, newStr: string) => {
    const newContent = chunks.map((c, i) => i === index ? newStr : c).join("");
    updateContent(newContent);
  };

  return (
    <div className="block min-h-[35vh]">
      {chunks.map((chunk, index) => {
        const isVideo = index % 2 !== 0; // 奇数インデックスは動画URL

        if (isVideo) {
          const videoId = chunk.match(/(?:v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
          return (
            <div key={`${index}-${chunk}`} className="relative group my-4 rounded-xl overflow-hidden shadow-2xl w-full border border-white/10" style={{ paddingTop: '56.25%' }}>
               {/* ホバー時のみ現れるURL直接編集バー（これを消せば動画も消える） */}
               <input 
                 className="absolute top-0 right-0 z-10 w-full text-right py-2 px-4 text-[10px] font-mono text-white/0 bg-transparent border-none outline-none group-hover:text-white/60 focus:text-white focus:bg-black/80 transition-all cursor-text"
                 value={chunk}
                 onChange={(e) => handleUpdateChunk(index, e.target.value)}
                 title="編集・削除するにはこのURLテキストを書き換えてください"
               />
               {videoId ? (
                 <iframe
                    className="absolute top-0 left-0 w-full h-full pointer-events-auto"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allowFullScreen
                  />
               ) : (
                 <div className="absolute top-0 left-0 w-full h-full bg-red-900/50 flex flex-col items-center justify-center">不正なURLです</div>
               )}
            </div>
          );
        } else {
          return (
            <RichTextBlock
              key={`text-${index}`}
              value={chunk}
              onChange={(val: string) => handleUpdateChunk(index, val)}
              placeholder={index === 0 && chunks.length === 1 ? "思考を展開する...\n『[YouTubeのURL]』と貼り付けるとインラインで動画に変わります。" : ""}
            />
          );
        }
      })}
    </div>
  );
};


export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [dailyContent, setDailyContent] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  
  // タブ管理システム
  const [openedTabs, setOpenedTabs] = useState<Tab[]>([{ id: null, title: "WORKSPACE" }]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // ドラッグ&ドロップのステート
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // サイドバーのリサイズステート
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, 150), 800); // 150px ~ 800pxの幅に制限
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const savedWidth = localStorage.getItem("hybrid-memo-sidebar-width");
    if (savedWidth) {
      setSidebarWidth(parseInt(savedWidth, 10));
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("hybrid-memo-notes", JSON.stringify(notes));
      localStorage.setItem("hybrid-memo-tabs", JSON.stringify({ openedTabs, activeTabId }));
      localStorage.setItem("hybrid-memo-sidebar-width", sidebarWidth.toString());
    }
  }, [notes, isLoaded, openedTabs, activeTabId, sidebarWidth]);

  // ▼ タブ追加＆切り替えロジック ▼
  const activateNote = (id: string | null, fallbackTitle: string = "WORKSPACE") => {
    const existingTitle = id === null ? "WORKSPACE" : (notes.find(n => n.id === id)?.title || "無題");
    
    setOpenedTabs(prev => {
      if (!prev.find(t => t.id === id)) {
        return [...prev, { id, title: existingTitle }];
      }
      // 存在する場合はタイトルを最新状態に同期するかも？
      return prev.map(t => t.id === id ? { ...t, title: existingTitle } : t);
    });
    setActiveTabId(id);
  };

  const closeTab = (e: React.MouseEvent, id: string | null) => {
    e.stopPropagation();
    setOpenedTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (id === activeTabId) {
        // アクティブなタブを閉じた場合、一番右側のタブをアクティブにする
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else {
          setActiveTabId(null);
        }
      }
      // もしすべてのタブを閉じたらWorkspaceを復活させる
      if (newTabs.length === 0) {
        return [{ id: null, title: "WORKSPACE" }];
      }
      return newTabs;
    });
  };

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayTitle = getTodayString();
  
  const dObj = new Date();
  const yyyy = String(dObj.getFullYear());
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dObj.getDate()).padStart(2, '0');

  const yearFolder = notes.find(n => n.parentId === null && n.title === yyyy);
  const monthFolder = yearFolder ? notes.find(n => n.parentId === yearFolder.id && n.title === mm) : null;
  
  const hasWrittenToday = monthFolder 
    ? notes.some(n => n.parentId === monthFolder.id && (n.title === dd || n.title === todayTitle))
    : false;

  // 1. デイリーノートの保存（「日記/YYYY/MM/DD」として階層的に自動保存）
  const handleDailySave = () => {
    if (!dailyContent.trim()) return;

    let updatedNotes = [...notes];
    
    // 存在しなければフォルダ（親ノート）を作成・取得するヘルパー関数
    const getOrCreateFolder = (title: string, parentId: string | null) => {
       let folder = updatedNotes.find(n => n.parentId === parentId && n.title === title);
       if (!folder) {
         folder = {
           id: crypto.randomUUID(),
           title,
           content: "",
           parentId,
           updatedAt: Date.now()
         };
         updatedNotes.push(folder);
       }
       return folder;
    };

    // 階層を順番にトラバース（または生成）
    const yearNode = getOrCreateFolder(yyyy, null);
    const monthNode = getOrCreateFolder(mm, yearNode.id);

    const newId = crypto.randomUUID();
    const newNote: Note = {
      id: newId,
      title: dd, // タイトルを「12」などの日付に固定
      content: dailyContent,
      parentId: monthNode.id,
      updatedAt: Date.now(),
    };

    updatedNotes.push(newNote);
    setNotes(updatedNotes);
    setDailyContent("");
    activateNote(null);
  };

  // 1.5 コンテキスト連動の手動作成ボタン
  const handleCreateNewNote = (type: 'document' | 'board' = 'document') => {
    let parentId = null;
    if (activeTabId) {
      parentId = activeTabId;
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: type === 'board' ? "無題のボード" : "無題のノート",
      content: type === 'board' ? JSON.stringify({ strokes: [] }) : "",
      parentId: parentId,
      updatedAt: Date.now(),
      type
    };

    setNotes([...notes, newNote]);
    activateNote(newNote.id, newNote.title);
  };

  // 3. 編集のオートセーブ (タイトルとコンテンツ独立)
  const handleUpdateTitle = (title: string) => {
    setNotes((prev) => prev.map((n) => {
      if (n.id === activeTabId) {
        return { ...n, title, updatedAt: Date.now() };
      }
      return n;
    }));
    // タブのタイトルも同期
    setOpenedTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, title: title || "無題" } : t));
  };

  const handleUpdateContent = (content: string) => {
    setNotes((prev) => prev.map((n) => {
      if (n.id === activeTabId) {
        return { ...n, content, updatedAt: Date.now() };
      }
      return n;
    }));
  };

  // 4. 再帰的削除
  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("このノートを削除しますか？紐づく子ノートも全て削除されます。")) {
       const idsToDelete = new Set([id]);
       const queue = [id];
       while(queue.length > 0) {
         const current = queue.pop()!;
         const childrenIds = notes.filter(n => n.parentId === current).map(n => n.id);
         childrenIds.forEach(c => {
           idsToDelete.add(c);
           queue.push(c);
         });
       }
       setNotes(prev => prev.filter(n => !idsToDelete.has(n.id)));
       
       // 開かれているタブからも削除されたノート群を取り除く
       let closingTabFound = false;
       setOpenedTabs(prev => {
         const newTabs = prev.filter(t => t.id === null || !idsToDelete.has(t.id));
         if (newTabs.length !== prev.length && activeTabId && idsToDelete.has(activeTabId)) {
            closingTabFound = true;
         }
         if (newTabs.length === 0) return [{ id: null, title: "WORKSPACE" }];
         return newTabs;
       });

       if (closingTabFound || (activeTabId && idsToDelete.has(activeTabId))) {
         activateNote(null);
       }
    }
  };

  if (!isLoaded) return <div className="min-h-screen bg-black" />;

  const activeNote = activeTabId ? notes.find(n => n.id === activeTabId) : null;
  const rootNotes = notes.filter(n => n.parentId === null);
  const childNotes = activeTabId ? notes.filter(n => n.parentId === activeTabId) : [];

  // ドラッグ時に親から子への無限ループ循環を防ぐチェック関数
  const isDescendant = (nodeId: string, targetId: string) => {
    let currentId: string | null = targetId;
    while (currentId !== null) {
      if (currentId === nodeId) return true;
      const currentNote = notes.find(n => n.id === currentId);
      currentId = currentNote ? currentNote.parentId : null;
    }
    return false;
  };

  // ==========================================
  // Obsidian風トグル式サイドパーツリー（再帰）
  // ==========================================
  const SidebarNode = ({ note, depth = 0 }: { note: Note; depth?: number }) => {
    const childrenNodes = notes.filter(n => n.parentId === note.id);
    const isActive = note.id === activeTabId;
    const [isOpen, setIsOpen] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);

    const toggleOpen = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(!isOpen);
    };

    const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      setDraggedNodeId(note.id);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); // ドロップ許可に必須
      e.stopPropagation();
      if (draggedNodeId === note.id || (draggedNodeId && isDescendant(draggedNodeId, note.id))) {
        return; // 自身・子孫へのドロップは不可
      }
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!draggedNodeId) return;
      if (draggedNodeId === note.id || isDescendant(draggedNodeId, note.id)) {
        return;
      }

      setNotes(prev => prev.map(n => n.id === draggedNodeId ? { ...n, parentId: note.id, updatedAt: Date.now() } : n));
      setDraggedNodeId(null);
    };

    return (
      <div className="flex flex-col">
        <div 
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-1 cursor-pointer transition-colors rounded text-sm group select-none
            ${isActive ? "bg-white/10 text-white font-medium" : "hover:bg-white/5 text-white/60"}
            ${isDragOver ? "ring-2 ring-blue-500 bg-blue-500/10" : ""}
          `}
          style={{ paddingLeft: `${depth * 16 + 12}px`, paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px' }}
        >
          <div 
            className="w-5 h-5 flex items-center justify-center text-[10px] text-white/30 hover:bg-white/10 rounded transition-colors"
            onClick={toggleOpen}
          >
            {childrenNodes.length > 0 ? (isOpen ? "▾" : "▸") : (note.type === 'board' ? "🎨" : "📄")}
          </div>
          
          <span 
            className="truncate flex-1 pl-1"
            onClick={() => activateNote(note.id, note.title)}
          >
            {note.title || "無題"}
          </span>
        </div>
        
        {isOpen && childrenNodes.length > 0 && (
          <div className="flex flex-col relative">
            {/* 階層を見やすくする縦線（インデントガイド） */}
            <div 
              className="absolute top-1 bottom-1 w-[1px] bg-white/10"
              style={{ left: `${depth * 16 + 22}px` }}
            />
            {childrenNodes.map(child => <SidebarNode key={child.id} note={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const shouldShowDailyEditor = activeTabId === null && !hasWrittenToday;

  return (
    <div className={`flex h-screen bg-black text-white font-sans overflow-hidden ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
      
      {/* -------------------------------
          純粋化された左サイドバー
      ------------------------------- */}
      <aside 
        className="bg-[#0a0a0a] border-r border-white/10 flex flex-col pt-6 pb-6 h-full flex-shrink-0 relative"
        style={{ width: `${sidebarWidth}px` }}
        onDragOver={(e) => {
          e.preventDefault(); // 空白エリアへのドロップを許可
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedNodeId) {
             // ルート（親なし）へのドロップ
             setNotes(prev => prev.map(n => n.id === draggedNodeId ? { ...n, parentId: null, updatedAt: Date.now() } : n));
             setDraggedNodeId(null);
          }
        }}
      >
        {/* リサイズ用ハンドル */}
        <div 
          className={`absolute top-0 -right-1 w-2 h-full cursor-col-resize z-50 transition-colors ${
            isResizing ? "bg-blue-500 opacity-100" : "opacity-0 hover:opacity-100 bg-blue-500/50"
          }`}
          onMouseDown={() => setIsResizing(true)}
        />

        <div className="px-4 mb-4 flex gap-2">
          <button 
            className="flex-1 flex items-center justify-center gap-1 bg-white/10 hover:bg-white/20 text-white font-medium text-sm py-2 px-2 rounded-lg transition-colors border border-white/5 shadow-sm"
            onClick={() => handleCreateNewNote('document')}
          >
            <span>＋</span> ページ
          </button>
          <button 
            className="flex-1 flex items-center justify-center gap-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-medium text-sm py-2 px-2 rounded-lg transition-colors border border-blue-500/20 shadow-sm"
            onClick={() => handleCreateNewNote('board')}
          >
            <span>🎨</span> ボード
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-0.5 mt-2">
            {rootNotes.map(note => (
              <SidebarNode key={note.id} note={note} />
            ))}
            {rootNotes.length === 0 && (
              <div className="px-6 py-4 text-xs text-white/30">テキストファイルがありません。</div>
            )}
          </div>
        </div>
      </aside>

      {/* -------------------------------
          メイン領域
      ------------------------------- */}
      <main className={`flex-1 flex flex-col relative bg-[#000000] ${activeNote?.type === 'board' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        
        {/* ==================================
             タブシステム (Window-like UI)
            ================================== */}
        <div className="sticky top-0 bg-[#050505] border-b border-white/10 flex items-center overflow-x-auto custom-scrollbar h-12 flex-shrink-0 z-20">
          {openedTabs.map(tab => (
            <div 
              key={tab.id || "root"}
              onClick={() => activateNote(tab.id, tab.title)}
              className={`flex items-center gap-3 px-5 h-full border-r border-white/10 cursor-pointer min-w-[120px] max-w-[200px] select-none transition-all group
                ${activeTabId === tab.id ? "bg-[#111111] text-white border-t-2 border-t-blue-500 font-medium shadow-inner" : "bg-transparent text-white/50 hover:bg-white/5"}
              `}
            >
              <span className="truncate flex-1 text-xs">
                {tab.id === null ? "🏠 Workspace" : (tab.title || "無題")}
              </span>
              <span 
                className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full transition-colors
                  ${activeTabId === tab.id ? "text-white/40 hover:bg-white/10 hover:text-white" : "text-transparent group-hover:text-white/30 hover:bg-white/10"}
                `}
                onClick={(e) => closeTab(e, tab.id)}
                title="閉じる"
              >
                ✕
              </span>
            </div>
          ))}
        </div>


        {/* 各画面のボディ部分 */}
        {activeNote?.type === 'board' ? (
           /* ====================================
              BOARD FULL SCREEN VIEW
           ====================================  */
           <div className="flex-1 w-full h-full relative">
              <div className="absolute top-4 right-6 z-50 flex items-center bg-black/60 shadow-lg backdrop-blur border border-white/10 rounded-lg px-4 py-2">
                 <input
                  key={`title-${activeNote.id}`}
                  type="text"
                  className="bg-transparent border-none text-xl font-bold tracking-tight outline-none text-white placeholder:text-white/20 text-right w-[150px] focus:w-[250px] transition-all"
                  defaultValue={activeNote.title}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  placeholder="無題のボード"
                 />
                 <div className="w-[1px] h-4 bg-white/20 mx-3"></div>
                 <span 
                  className="text-white/40 hover:text-red-400 cursor-pointer transition-colors text-sm" 
                  onClick={(e) => handleDeleteNote(activeNote.id, e)}
                  title="ボードを削除"
                 >
                  🗑️
                 </span>
              </div>
              <InfiniteBoard key={`board-${activeNote.id}`} content={activeNote.content} updateContent={handleUpdateContent} />
           </div>
        ) : (
        <div className="max-w-4xl w-full mx-auto p-8 md:p-12 lg:px-16 block min-h-full pb-32">
          
          {shouldShowDailyEditor ? (
            /* ====================================
               【1日1回】デイリー入力ダイアログ
            ====================================  */
            <section className="flex flex-col gap-4 animate-fade-in mt-10 mb-16">
              <header className="mb-4 text-center">
                <span className="text-4xl block mb-4">☀️</span>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                  {todayTitle} の日記
                </h1>
                <p className="text-white/40 text-sm border border-white/10 inline-block px-4 py-1 rounded-full mt-2">
                  毎日の日記は自動的に「日記」フォルダに分類されて保存されます。
                </p>
              </header>
              
              <div className="relative group max-w-2xl mx-auto w-full">
                <textarea
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-8 text-base outline-none focus:border-white/40 transition-all resize-none min-h-[300px] leading-relaxed placeholder:text-white/20 shadow-xl"
                  placeholder="ここにMarkdown感覚で入力..."
                  value={dailyContent}
                  onChange={(e) => setDailyContent(e.target.value)}
                  autoFocus
                />
                <div className="absolute bottom-6 right-6">
                  <button
                    onClick={handleDailySave}
                    disabled={!dailyContent.trim()}
                    className="bg-white text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                  >
                    保存してワークスペースへ
                  </button>
                </div>
              </div>
            </section>

          ) : activeTabId === null && hasWrittenToday ? (
            /* ====================================
               ルート一覧画面（デフォルトのWorkspace）
            ====================================  */
            <section className="flex flex-col gap-6 animate-fade-in mt-4 border-t border-white/10 pt-4 mb-16">
              <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-4">
                <h1 className="text-2xl font-bold text-white tracking-tight">Workspace のルートノート</h1>
                <button
                  onClick={() => handleCreateNewNote('document')}
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
                  {rootNotes.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => activateNote(note.id, note.title)}
                      className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col h-[200px]"
                    >
                      <h3 className="font-semibold text-lg text-white mb-3 truncate">
                        {note.title || "無題"}
                      </h3>
                      {(() => {
                         const yIds = extractYouTubeIds(note.content);
                         if (yIds.length === 0) return null;
                         return (
                           <div className="mb-3 rounded-lg overflow-hidden border border-white/5 h-24 flex-shrink-0 relative">
                             <img src={`https://img.youtube.com/vi/${yIds[0]}/mqdefault.jpg`} alt="YouTube preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                             <div className="absolute inset-0 flex items-center justify-center">
                               <div className="bg-red-600 text-white rounded-full w-8 h-6 flex items-center justify-center text-xs font-bold bg-opacity-90">▶</div>
                             </div>
                           </div>
                         );
                      })()}
                      <p className="text-white/50 text-sm line-clamp-3 mb-4 flex-1 whitespace-pre-wrap leading-relaxed">
                        {note.content}
                      </p>
                      <div className="flex justify-between items-center mt-auto">
                        <span className="text-xs text-white/30 font-mono">
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                        <span 
                          className="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors" 
                          onClick={(e) => handleDeleteNote(note.id, e)}
                          title="このノートを削除"
                        >
                          🗑️
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : activeNote ? (
            /* ====================================
               NOTE DETAIL: Scrapbox的ブロックエディタ
            ====================================  */
            <>
              {/* Note Header / Title */}
              <div className="flex items-center justify-between mt-4 mb-8">
                <input
                  key={`title-${activeNote.id}`}
                  type="text"
                  className="w-full mr-4 bg-transparent border-none text-4xl font-bold tracking-tight outline-none text-white placeholder:text-white/20"
                  defaultValue={activeNote.title}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  placeholder="ページタイトル..."
                />
                <span 
                  className="text-white/20 hover:text-red-400 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors flex-shrink-0" 
                  onClick={(e) => handleDeleteNote(activeNote.id, e)}
                  title="このノートとその下の全ての子ノートを削除"
                >
                  🗑️ 削除
                </span>
              </div>

              <section className="block animate-fade-in relative min-h-[25vh] pb-16">
                <BlockEditor key={`editor-${activeNote.id}`} content={activeNote.content} updateContent={handleUpdateContent} />
              </section>

              {/* Scrapbox的・子カード領域 */}
              <section className="flex flex-col gap-6 pb-20 border-t border-white/10 pt-12 mt-8">
                <div className="flex items-center gap-3 text-white/60 text-lg font-medium">
                  <span>🔗</span> リンクされた子ノート ({childNotes.length})
                </div>

                {childNotes.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {childNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => activateNote(note.id, note.title)}
                        className="bg-[#0a0a0a] border border-white/10 rounded-xl p-5 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col h-[180px]"
                      >
                        <h3 className="font-semibold text-white mb-2 truncate">
                          {note.title || "無題"}
                        </h3>
                        {(() => {
                           const yIds = extractYouTubeIds(note.content);
                           if (yIds.length === 0) return null;
                           return (
                             <div className="mb-2 rounded-md overflow-hidden border border-white/5 h-20 flex-shrink-0 relative">
                               <img src={`https://img.youtube.com/vi/${yIds[0]}/mqdefault.jpg`} alt="YouTube preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                               <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="bg-red-600 text-white rounded-[10px] w-8 h-5 flex items-center justify-center text-[10px] bg-opacity-80">▶</div>
                               </div>
                             </div>
                           );
                        })()}
                        <p className="text-white/50 text-xs line-clamp-3 mb-3 flex-1 whitespace-pre-wrap leading-relaxed">
                          {note.content}
                        </p>
                        <div className="flex justify-between items-center mt-auto">
                          <span className="text-[10px] text-white/30 font-mono">
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </span>
                          <span 
                            className="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors" 
                            onClick={(e) => handleDeleteNote(note.id, e)}
                          >
                            🗑️
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
             <div className="py-20 text-center text-white/30">ノートが開かれていません。</div>
          )}

        </div>
        )}
      </main>
    </div>
  );
}