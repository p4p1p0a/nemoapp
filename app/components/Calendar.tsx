"use client";
import { useState, useEffect, useRef } from "react";
import { Note, CalendarEvent, RecurrenceFreq, RecurrenceRule, Genre } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type { RecurrenceFreq };
export type { RecurrenceRule, CalendarEvent, Genre };

type EventInstance = CalendarEvent & { _isInstance?: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────
const EVENT_COLORS = [
  { label: 'ブルー',   val: '#3b82f6' },
  { label: 'グリーン', val: '#22c55e' },
  { label: 'レッド',   val: '#ef4444' },
  { label: 'オレンジ', val: '#f97316' },
  { label: 'パープル', val: '#a855f7' },
  { label: 'ピンク',   val: '#ec4899' },
  { label: 'グレー',   val: '#6b7280' },
];
const DAYS_JP  = ['日', '月', '火', '水', '木', '金', '土'];
const HOURS    = Array.from({ length: 24 }, (_, i) => i);
const HOUR_PX  = 56;
const FREQ_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
  { value: 'day',   label: '日ごと'   },
  { value: 'week',  label: '週間ごと' },
  { value: 'month', label: 'ヶ月ごと' },
  { value: 'year',  label: '年ごと'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr  = () => fmt(new Date());
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const toMin     = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const dayBefore = (s: string) => { const d=parseDate(s); d.setDate(d.getDate()-1); return fmt(d); };

function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor); d.setDate(d.getDate()-d.getDay());
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(d.getDate()+i); return dd; });
}

function getMonthGrid(anchor: Date): Date[] {
  const [y,m]=[anchor.getFullYear(),anchor.getMonth()];
  const firstDay=new Date(y,m,1).getDay(), lastDate=new Date(y,m+1,0).getDate(), prevLast=new Date(y,m,0).getDate();
  const cells:Date[]=[];
  for(let i=firstDay-1;i>=0;i--) cells.push(new Date(y,m-1,prevLast-i));
  for(let d=1;d<=lastDate;d++) cells.push(new Date(y,m,d));
  const rem=7-(cells.length%7); if(rem<7) for(let d=1;d<=rem;d++) cells.push(new Date(y,m+1,d));
  return cells;
}

const blankEvent = (date=todayStr()): Omit<CalendarEvent,'id'> => ({
  title:'', date, startTime:'09:00', endTime:'10:00', allDay:false, color:'#3b82f6', description:'', updatedAt: Date.now(),
});

// ─── Recurrence expansion ─────────────────────────────────────────────────────
function expandEvent(ev: CalendarEvent, viewStart: Date, viewEnd: Date): EventInstance[] {
  if (!ev.recurrence) {
    const d = parseDate(ev.date);
    return d >= viewStart && d <= viewEnd ? [ev as EventInstance] : [];
  }
  const rule = ev.recurrence;
  const base = parseDate(ev.date);
  const results: EventInstance[] = [];
  let totalCount = 0;
  const MAX = 3000;
  let iters = 0;

  const addIfInRange = (candidate: Date): boolean => {
    if (rule.endType==='date' && rule.endDate && candidate > parseDate(rule.endDate)) return false;
    if (rule.endType==='count' && rule.count && totalCount >= rule.count) return false;
    
    const ds = fmt(candidate);
    // キャンセルされた日程をスキップ
    if (!ev.excludedDates?.includes(ds)) {
      if (candidate >= viewStart && candidate <= viewEnd) {
        results.push({ ...ev, date: ds, _isInstance: true } as EventInstance);
      }
    }
    totalCount++;
    return true;
  };

  if (rule.freq === 'week' && rule.byDay && rule.byDay.length > 0) {
    const weekAnchor = new Date(base); weekAnchor.setDate(base.getDate()-base.getDay());
    let wo = 0;
    while (iters++ < MAX) {
      const wStart = new Date(weekAnchor); wStart.setDate(weekAnchor.getDate() + wo*rule.interval*7);
      if (wStart > viewEnd) break;
      for (const dow of [...rule.byDay].sort()) {
        const c = new Date(wStart); c.setDate(wStart.getDate()+dow);
        if (c < base) continue;
        if (!addIfInRange(c)) return results;
      }
      wo++;
    }
  } else {
    let current = new Date(base);
    while (iters++ < MAX) {
      if (current > viewEnd) break;
      if (current >= base && !addIfInRange(current)) break;
      const next = new Date(current);
      if      (rule.freq==='day')   next.setDate(current.getDate()+rule.interval);
      else if (rule.freq==='week')  next.setDate(current.getDate()+rule.interval*7);
      else if (rule.freq==='month') next.setMonth(current.getMonth()+rule.interval);
      else if (rule.freq==='year')  next.setFullYear(current.getFullYear()+rule.interval);
      if (next.getTime()===current.getTime()) break;
      current = next;
    }
  }
  return results;
}

const expandAll = (evs: CalendarEvent[], vs: Date, ve: Date): EventInstance[] => evs.flatMap(e => expandEvent(e,vs,ve));

// ─── Recurrence label ─────────────────────────────────────────────────────────
function recLabel(rule?: RecurrenceRule): string {
  if (!rule) return '繰り返しなし';
  const u: Record<RecurrenceFreq,string> = { day:'日',week:'週間',month:'ヶ月',year:'年' };
  let s = rule.interval===1 ? `毎${u[rule.freq]}` : `${rule.interval}${u[rule.freq]}ごと`;
  if (rule.freq==='week' && rule.byDay?.length) s += ` (${rule.byDay.map(d=>DAYS_JP[d]).join('、')})`;
  if (rule.endType==='date' && rule.endDate) s += `、${rule.endDate}まで`;
  if (rule.endType==='count' && rule.count) s += `、${rule.count}回`;
  return s;
}

// ─── デイリーノート検索ヘルパー ───────────────────────────────────────────────
function findDailyNote(dateStr: string, notes: Note[]): Note | null {
  const [yyyy, mm, dd] = dateStr.split('-');
  const yearFolder  = notes.find(n => n.parentId === null && n.title === yyyy);
  if (!yearFolder) return null;
  const monthFolder = notes.find(n => n.parentId === yearFolder.id && n.title === mm);
  if (!monthFolder) return null;
  return notes.find(n => n.parentId === monthFolder.id && (n.title === dd || n.title === dateStr)) ?? null;
}

type DailyNoteStatus = 'has-note' | 'no-note-past' | 'no-note-future';
function getDailyNoteStatus(dateStr: string, notes: Note[]): DailyNoteStatus {
  if (findDailyNote(dateStr, notes)) return 'has-note';
  return dateStr <= todayStr() ? 'no-note-past' : 'no-note-future';
}

// ─── NoteSelector ─────────────────────────────────────────────────────────────
function NoteSelector({ notes, onSelect }: { notes: Note[]; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'note' | 'board'>('all');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = notes
    .filter(n => {
      if (filter === 'note')  return n.type !== 'board';
      if (filter === 'board') return n.type === 'board';
      return true;
    })
    .filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  const FILTERS = [['all', 'すべて'], ['note', '📄 ノート'], ['board', '🎨 ボード']] as const;

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      <div className="flex gap-1">
        {FILTERS.map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors ${
              filter === v ? 'bg-blue-500/25 text-blue-300 border border-blue-500/30' : 'text-white/30 hover:text-white/60 border border-transparent'
            }`}>
            {label}
          </button>
        ))}
      </div>
      <input
        placeholder={filter === 'board' ? 'ボードを検索...' : filter === 'note' ? 'ノートを検索...' : 'ノート / ボードを検索...'}
        value={search}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 placeholder:text-white/30 transition-colors"
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#242424] border border-white/10 rounded-xl shadow-2xl max-h-[180px] overflow-y-auto">
          {filtered.map(note => (
            <button
              key={note.id}
              onClick={() => { onSelect(note.id); setSearch(''); setIsOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <span className="text-base leading-none">{note.type === 'board' ? '🎨' : note.type === 'daily' ? '📆' : '📄'}</span>
              <span className="truncate flex-1">{note.title || '無題'}</span>
              {note.type === 'board' && (
                <span className="text-[10px] text-blue-400/60 border border-blue-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">ボード</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal Components ─────────────────────────────────────────────────────────
function RecurrenceModal({ initial, baseDate, onApply, onClose }: {
  initial?: RecurrenceRule; baseDate: string;
  onApply: (rule: RecurrenceRule) => void; onClose: () => void;
}) {
  const [freq,     setFreq]     = useState<RecurrenceFreq>(initial?.freq ?? 'week');
  const [interval, setInterval] = useState(initial?.interval ?? 1);
  const [byDay,    setByDay]    = useState<number[]>(initial?.byDay ?? [parseDate(baseDate).getDay()]);
  const [endType,  setEndType]  = useState<'never'|'date'|'count'>(initial?.endType ?? 'never');
  const [endDate,  setEndDate]  = useState(initial?.endDate ?? '');
  const [count,    setCount]    = useState(initial?.count ?? 1);

  const toggleDay = (d: number) =>
    setByDay(p => p.includes(d) ? (p.length>1 ? p.filter(x=>x!==d) : p) : [...p,d]);

  const handleApply = () => onApply({
    freq, interval: Math.max(1,interval),
    byDay: freq==='week' ? byDay : undefined,
    endType,
    endDate: endType==='date' ? endDate : undefined,
    count:   endType==='count' ? Math.max(1,count) : undefined,
  });

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#202020] border border-white/10 rounded-2xl shadow-2xl p-7 w-[420px] max-w-[95vw] flex flex-col gap-6"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-white">カスタムの繰り返し</h2>
        <div>
          <div className="text-sm text-white/45 mb-3">繰り返す間隔:</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <input type="number" min={1} max={999} value={interval}
                onChange={e => setInterval(Math.max(1,parseInt(e.target.value)||1))}
                className="w-16 bg-transparent text-white text-sm text-center outline-none py-2.5 px-2" />
            </div>
            <select value={freq} onChange={e => setFreq(e.target.value as RecurrenceFreq)}
              className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none cursor-pointer">
              {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {freq === 'week' && (
          <div>
            <div className="text-sm text-white/45 mb-3">曜日:</div>
            <div className="flex gap-2">
              {DAYS_JP.map((d,i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition-all ${byDay.includes(i) ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-white/45 hover:bg-white/10 transition-colors">キャンセル</button>
          <button onClick={handleApply} className="px-6 py-2 rounded-xl text-sm bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors">完了</button>
        </div>
      </div>
    </div>
  );
}

function GenreManager({ genres, onSave, onDelete, onClose }: { genres: Genre[]; onSave: (gs: Genre[]) => void; onDelete?: (id: string) => void; onClose: () => void; }) {
  const [list, setList] = useState<Genre[]>(genres);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const handleAdd = () => { const next = [...list, { id: crypto.randomUUID(), name: '新しいジャンル', color: '#6b7280', updatedAt: Date.now() }]; setList(next); onSave(next); };
  const handleStartEdit = (g: Genre) => { setEditingId(g.id); setEditName(g.name); setEditColor(g.color); };
  const handleCommitEdit = () => {
    const next = list.map(g => g.id === editingId ? { ...g, name: editName, color: editColor, updatedAt: Date.now() } : g);
    setList(next); onSave(next); setEditingId(null);
  };
  const handleDelete = (id: string) => { 
    if (list.length <= 1) return;
    if (confirm('このジャンルを削除しますか？')) {
      onDelete?.(id);
    }
  };
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-7 w-[480px] max-w-[95vw] flex flex-col gap-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">ジャンルの管理</h2>
          <button onClick={handleAdd} className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">+ ジャンルを追加</button>
        </div>
        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto px-1">
          {list.map(g => (
            <div key={g.id} className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/[0.08] group">
              {editingId === g.id ? (
                <div className="flex-1 flex items-center gap-3">
                  <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-none appearance-none" />
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCommitEdit()} className="flex-1 bg-[#252525] border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none" />
                  <button onClick={handleCommitEdit} className="text-emerald-400 text-sm font-bold px-2">確定</button>
                </div>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="flex-1 text-sm font-medium text-white/90">{g.name}</span>
                  <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleStartEdit(g)} className="p-1.5 text-white/40 hover:text-white transition-colors">✏️</button>
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 text-white/40 hover:text-red-400 transition-colors">🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm bg-white/10 text-white hover:bg-white/15 transition-colors font-semibold">閉じる</button>
        </div>
      </div>
    </div>
  );
}

interface CalendarProps {
  notes?: Note[];
  onOpenDailyNote?: (dateStr: string) => void;
  onNavigateToNote?: (noteId: string) => void;
  events: CalendarEvent[];
  onSaveEvents: (evs: CalendarEvent[]) => void;
  onDeleteEvent?: (id: string, date?: string, mode?: 'only' | 'following' | 'all') => void;
  genres: Genre[];
  onSaveGenres: (gs: Genre[]) => void;
  onDeleteGenre?: (id: string) => void;
}

function EventModal({ initial, onSave, onDelete, onClose, notes, onNavigateToNote, genres, onOpenGenreManager }: {
  initial: Partial<CalendarEvent> & { date: string };
  onSave: (ev: Omit<CalendarEvent,'id'>) => void;
  onDelete?: () => void;
  onClose: () => void;
  notes?: Note[];
  onNavigateToNote?: (noteId: string) => void;
  genres: Genre[];
  onOpenGenreManager: () => void;
}) {
  const [form, setForm] = useState<Omit<CalendarEvent,'id'>>({ ...blankEvent(initial.date), ...initial });
  const [showRecModal, setShowRecModal] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p=>({...p,[k]:v}));
  const isEdit = !!(initial as CalendarEvent).id;
  const selectedGenre = genres.find(g => g.id === form.genreId) || genres[0];
  const handleGenreChange = (gid: string) => { const g = genres.find(x => x.id === gid); if (g) setForm(p => ({ ...p, genreId: gid, color: g.color })); };

  const recSelectValue = () => {
    if (!form.recurrence) return 'none';
    const r = form.recurrence;
    if (r.freq==='day'   && r.interval===1 && r.endType==='never') return 'daily';
    if (r.freq==='week'  && r.interval===1 && r.endType==='never') return 'weekly';
    if (r.freq==='month' && r.interval===1 && r.endType==='never') return 'monthly';
    if (r.freq==='year'  && r.interval===1 && r.endType==='never') return 'yearly';
    return 'custom';
  };
  const handleRecSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === 'none') { set('recurrence', undefined); return; }
    if (v === 'custom') { setShowRecModal(true); return; }
    const dow = parseDate(form.date).getDay();
    const presets: Record<string, RecurrenceRule> = {
      daily: { freq:'day', interval:1, endType:'never' },
      weekly: { freq:'week', interval:1, byDay:[dow], endType:'never' },
      monthly: { freq:'month', interval:1, endType:'never' },
      yearly: { freq:'year', interval:1, endType:'never' },
    };
    set('recurrence', presets[v]);
  };
  const linkedNote = notes?.find(n => n.id === form.linkedNoteId);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="relative bg-[#181818] border border-white/10 rounded-2xl shadow-2xl p-6 w-[440px] max-w-[95vw] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
          <h2 className="text-base font-semibold text-white">{isEdit ? 'イベントを編集' : 'イベントを作成'}</h2>
          <input autoFocus placeholder="タイトル" value={form.title} onChange={e => set('title', e.target.value)} onKeyDown={e => { if(e.key==='Enter'&&form.title.trim()) onSave(form); }} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 transition-colors" />
          <div className="flex items-center gap-3"><span className="text-xs text-white/35 w-12 flex-shrink-0">日付</span><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60" /></div>
          {!form.allDay && (
            <div className="flex items-center gap-2"><span className="text-xs text-white/35 w-12 flex-shrink-0">時間</span><input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" /><span className="text-white/25">→</span><input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
          )}
          <div className="flex items-start gap-3"><span className="text-xs text-white/35 w-12 flex-shrink-0 mt-2.5">ジャンル</span><div className="flex-1 flex flex-col gap-2"><div className="flex gap-2"><select value={form.genreId || ''} onChange={e => handleGenreChange(e.target.value)} className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none cursor-pointer">{!form.genreId && <option value="">選択してください</option>}{genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select><button onClick={onOpenGenreManager} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">⚙️</button></div></div></div>
          <div className="flex items-start gap-3"><span className="text-xs text-white/35 w-12 flex-shrink-0 mt-2.5">繰り返し</span><select value={recSelectValue()} onChange={handleRecSelect} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none cursor-pointer"><option value="none">繰り返しなし</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月</option><option value="yearly">毎年</option><option value="custom">カスタム...</option></select></div>

          {/* ── 紐づけられたノート ── */}
          {notes && notes.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <div className="text-xs text-white/35 mb-2 flex items-center gap-1.5">
                <span>📄</span>
                <span>紐づけられたノート</span>
              </div>
              {form.linkedNoteId && linkedNote ? (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                  <span className="text-base leading-none">{linkedNote.type === 'board' ? '🎨' : linkedNote.type === 'daily' ? '📆' : '📄'}</span>
                  <span className="flex-1 text-sm text-white truncate">{linkedNote.title || '無題'}</span>
                  <button onClick={() => { onNavigateToNote?.(form.linkedNoteId!); onClose(); }} className="text-blue-400 text-xs hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">開く →</button>
                  <button onClick={() => set('linkedNoteId', undefined)} className="text-white/30 hover:text-red-400 text-xs transition-colors px-1">✕</button>
                </div>
              ) : (
                <NoteSelector notes={notes} onSelect={(id) => set('linkedNoteId', id)} />
              )}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-4">
            {onDelete && <button onClick={onDelete} className="px-4 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">削除</button>}
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/45 hover:bg-white/10 transition-colors">キャンセル</button>
            <button disabled={!form.title.trim()} onClick={() => onSave(form)} className="px-5 py-2 rounded-xl text-sm bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors">保存</button>
          </div>
        </div>
      </div>
      {showRecModal && <RecurrenceModal initial={form.recurrence} baseDate={form.date} onApply={rule => { set('recurrence', rule); setShowRecModal(false); }} onClose={() => setShowRecModal(false)} />}
    </>
  );
}

// ─── RecurrenceDeleteModal ────────────────────────────────────────────────────
function RecurrenceDeleteModal({ onConfirm, onClose }: { onConfirm: (choice: 'only' | 'following' | 'all') => void; onClose: () => void; }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-7 w-[380px] max-w-[95vw] flex flex-col gap-6" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1"><h2 className="text-lg font-bold text-white">繰り返し予定の削除</h2><p className="text-sm text-white/50">この定期的なイベントをどのように削除しますか？</p></div>
        <div className="flex flex-col gap-2.5">
          <button onClick={() => onConfirm('only')} className="w-full text-left p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-white font-medium group"><span className="block mb-0.5">この予定のみ</span><span className="text-[11px] text-white/30 group-hover:text-white/50">選択した日の予定だけを削除します。</span></button>
          <button onClick={() => onConfirm('following')} className="w-full text-left p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-white font-medium group"><span className="block mb-0.5">これ以降すべての予定</span><span className="text-[11px] text-white/30 group-hover:text-white/50">選択した日以降のすべての予定を削除します。</span></button>
          <button onClick={() => onConfirm('all')} className="w-full text-left p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-white font-medium group"><span className="block mb-0.5">すべての予定</span><span className="text-[11px] text-white/30 group-hover:text-white/50">シリーズ全体の予定をすべて削除します。</span></button>
        </div>
        <div className="flex justify-end pt-1"><button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-white/40 hover:bg-white/5 transition-colors">キャンセル</button></div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ anchor, events, onSelectDay, openEdit, notes, onOpenDailyNote }: {
  anchor: Date; events: CalendarEvent[];
  onSelectDay: (date: string) => void;
  openEdit: (ev: CalendarEvent) => void;
  notes?: Note[];
  onOpenDailyNote?: (dateStr: string) => void;
}) {
  const cells = getMonthGrid(anchor);
  const today = todayStr();
  const curMonth = anchor.getMonth();
  const instances = expandAll(events, cells[0], cells[cells.length-1]);
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/10 flex-shrink-0">{DAYS_JP.map((d,i) => (<div key={d} className={`text-center text-xs py-2.5 font-medium ${i===0?'text-red-400/70':i===6?'text-blue-400/70':'text-white/30'}`}>{d}</div>))}</div>
      <div className="flex-1 overflow-y-auto grid grid-cols-7" style={{ gridTemplateRows:`repeat(${cells.length/7},minmax(100px,1fr))` }}>
        {cells.map((cell,idx) => {
          const ds = fmt(cell);
          const isCur = cell.getMonth() === curMonth;
          const dailyStatus = notes && isCur ? getDailyNoteStatus(ds, notes) : null;

          return (
            <div key={idx} onClick={() => onSelectDay(ds)} className={`border-b border-r border-white/[0.06] p-1.5 cursor-pointer hover:bg-white/[0.025] flex flex-col gap-0.5 ${idx%7===0?'border-l':''}`}>
              {/* 日付数字 + デイリーノートインジケーター */}
              <div className="flex items-center gap-1 self-start mb-0.5">
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium transition-colors
                    ${ds===today ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-white/80'}
                    ${!isCur ? 'opacity-20' : ''}
                    ${onOpenDailyNote ? 'hover:bg-white/10' : ''}
                  `}
                  onClick={onOpenDailyNote && isCur ? (e) => { e.stopPropagation(); onOpenDailyNote(ds); } : undefined}
                >
                  {cell.getDate()}
                </div>
                {dailyStatus === 'has-note' && (
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)] cursor-pointer flex-shrink-0"
                    onClick={e => { e.stopPropagation(); onOpenDailyNote?.(ds); }}
                    title="デイリーノートを開く"
                  />
                )}
                {dailyStatus === 'no-note-past' && (
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_3px_rgba(239,68,68,0.5)] cursor-pointer flex-shrink-0"
                    onClick={e => { e.stopPropagation(); onOpenDailyNote?.(ds); }}
                    title="デイリーノートを作成する"
                  />
                )}
              </div>
              {instances.filter(e => e.date === ds).slice(0,3).map((ev,i) => (
                <div key={ev.id+i} onClick={e=>{e.stopPropagation();openEdit(ev);}} className="text-[11px] px-1.5 py-0.5 rounded text-white truncate" style={{ backgroundColor: ev.color+'cc' }}>{ev.title}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid ────────────────────────────────────────────────────────────────
function TimeGridView({ days, events, openCreate, openEdit, notes, onOpenDailyNote }: {
  days: Date[]; events: CalendarEvent[];
  openCreate: (date: string, startTime?: string) => void;
  openEdit: (ev: CalendarEvent) => void;
  notes?: Note[];
  onOpenDailyNote?: (dateStr: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayStr();
  const vStart = new Date(days[0]); vStart.setHours(0,0,0,0);
  const vEnd = new Date(days[days.length-1]); vEnd.setHours(23,59,59,999);
  const instances = expandAll(events, vStart, vEnd);
  const cols = `56px repeat(${days.length},1fr)`;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="grid border-b border-white/10 flex-shrink-0" style={{gridTemplateColumns:cols}}>
        <div className="border-r border-white/[0.06]" />
        {days.map((d,i)=>{
          const ds = fmt(d);
          const dailyStatus = notes ? getDailyNoteStatus(ds, notes) : null;
          return (
            <div key={i} className="flex flex-col items-center py-2 border-r border-white/[0.06] last:border-r-0">
              <span className="text-[11px] text-white/30">{DAYS_JP[d.getDay()]}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-semibold transition-colors
                    ${ds===today ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'text-white/75'}
                    ${onOpenDailyNote ? 'hover:bg-white/10 cursor-pointer' : ''}
                  `}
                  onClick={onOpenDailyNote ? () => onOpenDailyNote(ds) : undefined}
                >
                  {d.getDate()}
                </div>
                {dailyStatus === 'has-note' && (
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)] cursor-pointer flex-shrink-0"
                    onClick={() => onOpenDailyNote?.(ds)}
                    title="デイリーノートを開く"
                  />
                )}
                {dailyStatus === 'no-note-past' && (
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_3px_rgba(239,68,68,0.5)] cursor-pointer flex-shrink-0"
                    onClick={() => onOpenDailyNote?.(ds)}
                    title="デイリーノートを作成する"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{gridTemplateColumns:cols,height:`${HOUR_PX*24}px`}}>
          <div className="relative border-r border-white/[0.06]">{HOURS.map(h=>(<div key={h} className="absolute right-2 text-[11px] text-white/20" style={{top:h*HOUR_PX-8}}>{h!==0?`${h}:00`:''}</div>))}</div>
          {days.map((d,di)=>{
            const ds=fmt(d);
            return (
              <div key={di} className="relative border-r border-white/[0.06] last:border-r-0 cursor-pointer" onClick={e=>{const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();const t=Math.round((e.clientY-rect.top)/HOUR_PX*60/15)*15;const h=Math.floor(t/60),m=t%60;openCreate(ds,`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);}}>
                {HOURS.map(h=><div key={h} className="absolute inset-x-0 border-t border-white/[0.07]" style={{top:h*HOUR_PX}}/>)}
                {instances.filter(e=>e.date===ds&&!e.allDay).map((ev,j)=>{
                  const start=toMin(ev.startTime||'09:00'), end=toMin(ev.endTime||'10:00');
                  return (<div key={ev.id+j} onClick={e=>{e.stopPropagation();openEdit(ev);}} className="absolute inset-x-0.5 rounded px-1.5 py-0.5 text-white text-xs hover:brightness-110 overflow-hidden border-l-2" style={{top:(start/60)*HOUR_PX,height:Math.max(22,((end-start)/60)*HOUR_PX-2),backgroundColor:ev.color+'22',borderLeftColor:ev.color}}><p className="font-semibold truncate" style={{color:ev.color}}>{ev.title}</p></div>);
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Calendar({ 
  notes, onOpenDailyNote, onNavigateToNote, 
  events, onSaveEvents, onDeleteEvent,
  genres, onSaveGenres, onDeleteGenre
}: CalendarProps) {
  const [view, setView] = useState<'month'|'week'|'day'>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [modal, setModal] = useState<{mode:'create'|'edit';data:Partial<CalendarEvent>&{date:string}}|null>(null);
  const [showGenreManager, setShowGenreManager] = useState(false);
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, date: string} | null>(null);

  const filteredEvents = selectedGenreId ? events.filter(e => e.genreId === selectedGenreId) : events;
  const saveEvents = (evs: CalendarEvent[]) => onSaveEvents(evs);
  const addEvent = (data: Omit<CalendarEvent,'id'>) => { saveEvents([...events,{...data,id:crypto.randomUUID()}]); setModal(null); };
  const updateEvent = (id: string, data: Omit<CalendarEvent,'id'>) => { saveEvents(events.map(e=>e.id===id?{...data,id}:e)); setModal(null); };

  const handleDeleteRecurrence = (id: string, date: string, choice: 'only' | 'following' | 'all') => {
    onDeleteEvent?.(id, date, choice);
    setModal(null); setDeleteTarget(null);
  };

  const openCreate = (date: string, startTime?: string) => {
    const st = startTime||'09:00'; const [h] = st.split(':').map(Number); const et = `${String(Math.min(h+1,23)).padStart(2,'0')}:00`;
    setModal({mode:'create',data:{...blankEvent(date),startTime:st,endTime:et, genreId: genres[0]?.id, color: genres[0]?.color}});
  };
  const openEdit = (ev: CalendarEvent) => setModal({mode:'edit',data:{...(events.find(e=>e.id===ev.id)||ev), date: ev.date}});

  const navigate = (dir: -1|1) => {
    const d = new Date(anchor);
    if(view==='month') d.setMonth(d.getMonth()+dir);
    else if(view==='week') d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setAnchor(d);
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0a0a0a] overflow-hidden text-white">
      <div className="flex items-center gap-2 px-5 h-14 border-b border-white/10 flex-shrink-0">
        <button onClick={() => setAnchor(new Date())} className="px-3 py-1.5 text-sm font-medium border border-white/15 rounded-lg text-white/70 hover:bg-white/10 transition-colors">今日</button>
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:bg-white/10 text-2xl transition-colors">‹</button>
        <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:bg-white/10 text-2xl transition-colors">›</button>
        <span className="text-[15px] font-semibold text-white/90 flex-1 ml-1 select-none">{anchor.getFullYear()}年 {anchor.getMonth()+1}月</span>
        <div className="flex border border-white/10 rounded-lg overflow-hidden">
          {(['day','week','month'] as const).map(v=>(<button key={v} onClick={() => setView(v)} className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${view===v?'bg-blue-600 text-white':'text-white/45 hover:bg-white/10'}`}>{{day:'日',week:'週',month:'月'}[v]}</button>))}
        </div>
        <button onClick={() => openCreate(fmt(anchor))} className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors ml-2">+ 作成</button>
      </div>

      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10 overflow-x-auto no-scrollbar">
        <button onClick={() => setSelectedGenreId(null)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedGenreId === null ? 'bg-white text-black border-white' : 'bg-transparent text-white/40 border-white/10 hover:border-white/20'}`}>すべて</button>
        {genres.map(g => (<button key={g.id} onClick={() => setSelectedGenreId(g.id)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 border ${selectedGenreId === g.id ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-transparent hover:bg-white/10'}`}><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />{g.name}</button>))}
        <button onClick={() => setShowGenreManager(true)} className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white/30 border border-white/5 hover:border-white/20 transition-all flex items-center gap-1.5"><span>⚙️</span> 管理</button>
      </div>

      {view==='month' && <MonthView anchor={anchor} events={filteredEvents} onSelectDay={(ds) => { setAnchor(parseDate(ds)); setView('day'); }} openEdit={openEdit} notes={notes} onOpenDailyNote={onOpenDailyNote} />}
      {view==='week' && <TimeGridView days={getWeekDays(anchor)} events={filteredEvents} openCreate={openCreate} openEdit={openEdit} notes={notes} onOpenDailyNote={onOpenDailyNote} />}
      {view==='day' && <TimeGridView days={[anchor]} events={filteredEvents} openCreate={openCreate} openEdit={openEdit} notes={notes} onOpenDailyNote={onOpenDailyNote} />}

      {modal && <EventModal initial={modal.data} onSave={data => modal.mode==='create' ? addEvent(data) : updateEvent((modal.data as CalendarEvent).id, data)} onDelete={() => { const d = modal.data as CalendarEvent; if (d.recurrence) setDeleteTarget({id: d.id, date: d.date}); else onDeleteEvent?.(d.id); }} onClose={() => setModal(null)} notes={notes} onNavigateToNote={onNavigateToNote} genres={genres} onOpenGenreManager={() => setShowGenreManager(true)} />}
      {deleteTarget && <RecurrenceDeleteModal onConfirm={(choice) => handleDeleteRecurrence(deleteTarget.id, deleteTarget.date, choice)} onClose={() => setDeleteTarget(null)} />}
      {showGenreManager && <GenreManager genres={genres} onSave={onSaveGenres} onDelete={onDeleteGenre} onClose={() => setShowGenreManager(false)} />}
    </div>
  );
}
