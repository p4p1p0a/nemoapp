"use client";
import { useState, useEffect } from "react";
import { AppWindowData } from "../types";

interface Props {
  windows: AppWindowData[];
  onToggle: (id: string) => void;
  activeWindowId: string | null;
  onToggleSidebar: () => void;
}

export default function Taskbar({ windows, onToggle, activeWindowId, onToggleSidebar }: Props) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const visible = windows.filter(w => w.state !== 'minimized' || w.isPinned || w.state === 'minimized');

  return (
    <div className="fixed bottom-0 inset-x-0 h-12 z-[9000] flex items-center px-2 gap-1"
      style={{ background: 'rgba(8,8,28,0.92)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* App icon */}
      <button 
        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mr-1 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
        onClick={onToggleSidebar}
        title="ノートツリーを表示"
      >
        🐟
      </button>
      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Window buttons */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto pl-1">
        {Array.from(new Map(windows.map(w => [w.id, w])).values()).map(w => {
          const isActive = w.id === activeWindowId && w.state !== 'minimized';
          const icon = w.id === '__calendar__' ? '📅' : w.noteType === 'board' ? '🎨' : w.noteType === 'daily' ? '📓' : '📄';
          return (
            <button
              key={w.id}
              onClick={() => onToggle(w.id)}
              title={w.title}
              className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium transition-all duration-150 max-w-[160px] relative
                ${isActive ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
            >
              <span>{icon}</span>
              <span className="truncate">{w.title}</span>
              {isActive && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Clock */}
      <div className="text-white/50 text-xs font-mono px-3 flex-shrink-0">{time}</div>
    </div>
  );
}
