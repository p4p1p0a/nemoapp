"use client";
import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year';

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval: number;
  byDay?: number[];            // 0=Sun…6=Sat (week only)
  endType: 'never' | 'date' | 'count';
  endDate?: string;            // YYYY-MM-DD
  count?: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string;
  description: string;
  recurrence?: RecurrenceRule;
};

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

const Storage = {
  load: (): CalendarEvent[] => { try { return JSON.parse(localStorage.getItem('nemo-calendar-events')||'[]'); } catch { return []; } },
  save: (evs: CalendarEvent[]) => localStorage.setItem('nemo-calendar-events', JSON.stringify(evs)),
};

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
  title:'', date, startTime:'09:00', endTime:'10:00', allDay:false, color:'#3b82f6', description:'',
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
    if (candidate >= viewStart && candidate <= viewEnd)
      results.push({ ...ev, date: fmt(candidate), _isInstance: true } as EventInstance);
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

// ─── RecurrenceModal ──────────────────────────────────────────────────────────
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

        {/* 繰り返す間隔 */}
        <div>
          <div className="text-sm text-white/45 mb-3">繰り返す間隔:</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <input type="number" min={1} max={999} value={interval}
                onChange={e => setInterval(Math.max(1,parseInt(e.target.value)||1))}
                className="w-16 bg-transparent text-white text-sm text-center outline-none py-2.5 px-2
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <div className="flex flex-col border-l border-white/10">
                <button onClick={() => setInterval(v=>v+1)} className="px-2 py-1 text-white/40 hover:bg-white/10 hover:text-white text-[10px] transition-colors">▲</button>
                <button onClick={() => setInterval(v=>Math.max(1,v-1))} className="px-2 py-1 text-white/40 hover:bg-white/10 hover:text-white text-[10px] border-t border-white/10 transition-colors">▼</button>
              </div>
            </div>
            <select value={freq} onChange={e => setFreq(e.target.value as RecurrenceFreq)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none cursor-pointer">
              {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* 曜日（週のみ） */}
        {freq === 'week' && (
          <div>
            <div className="text-sm text-white/45 mb-3">曜日:</div>
            <div className="flex gap-2">
              {DAYS_JP.map((d,i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition-all
                    ${byDay.includes(i)
                      ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]'
                      : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/15 hover:text-white'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 終了 */}
        <div>
          <div className="text-sm text-white/45 mb-3">終了日</div>
          <div className="flex flex-col gap-3.5">
            {/* なし */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="et" value="never" checked={endType==='never'} onChange={() => setEndType('never')} className="accent-blue-500 w-4 h-4" />
              <span className="text-sm text-white/70">なし</span>
            </label>
            {/* 終了日 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="et" value="date" checked={endType==='date'} onChange={() => setEndType('date')} className="accent-blue-500 w-4 h-4" />
              <span className="text-sm text-white/70 w-16">終了日:</span>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setEndType('date'); }}
                onClick={() => setEndType('date')}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 transition-colors" />
            </label>
            {/* 回数 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="et" value="count" checked={endType==='count'} onChange={() => setEndType('count')} className="accent-blue-500 w-4 h-4" />
              <span className="text-sm text-white/70 w-16">繰り返し:</span>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden" onClick={() => setEndType('count')}>
                <input type="number" min={1} max={999} value={count}
                  onChange={e => { setCount(Math.max(1,parseInt(e.target.value)||1)); setEndType('count'); }}
                  className="w-16 bg-transparent text-white text-sm text-center outline-none py-2.5 px-2
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <div className="flex flex-col border-l border-white/10">
                  <button onClick={() => { setCount(v=>v+1); setEndType('count'); }} className="px-2 py-1 text-white/40 hover:bg-white/10 hover:text-white text-[10px] transition-colors">▲</button>
                  <button onClick={() => { setCount(v=>Math.max(1,v-1)); setEndType('count'); }} className="px-2 py-1 text-white/40 hover:bg-white/10 hover:text-white text-[10px] border-t border-white/10 transition-colors">▼</button>
                </div>
              </div>
              <span className="text-sm text-white/45 ml-1">回</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-white/45 hover:bg-white/10 transition-colors">キャンセル</button>
          <button onClick={handleApply} className="px-6 py-2 rounded-xl text-sm bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors">完了</button>
        </div>
      </div>
    </div>
  );
}

// ─── EventModal ───────────────────────────────────────────────────────────────
function EventModal({ initial, onSave, onDelete, onClose }: {
  initial: Partial<CalendarEvent> & { date: string };
  onSave: (ev: Omit<CalendarEvent,'id'>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<CalendarEvent,'id'>>({ ...blankEvent(initial.date), ...initial });
  const [showRecModal, setShowRecModal] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p=>({...p,[k]:v}));
  const isEdit = !!(initial as CalendarEvent).id;

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
    if (v === 'none')   { set('recurrence', undefined); return; }
    if (v === 'custom') { setShowRecModal(true); return; }
    const dow = parseDate(form.date).getDay();
    const presets: Record<string, RecurrenceRule> = {
      daily:   { freq:'day',   interval:1, endType:'never' },
      weekly:  { freq:'week',  interval:1, byDay:[dow], endType:'never' },
      monthly: { freq:'month', interval:1, endType:'never' },
      yearly:  { freq:'year',  interval:1, endType:'never' },
    };
    set('recurrence', presets[v]);
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="relative bg-[#181818] border border-white/10 rounded-2xl shadow-2xl p-6 w-[440px] max-w-[95vw] flex flex-col gap-4"
          onClick={e => e.stopPropagation()}>
          <h2 className="text-base font-semibold text-white">{isEdit ? 'イベントを編集' : 'イベントを作成'}</h2>

          <input autoFocus placeholder="タイトル" value={form.title} onChange={e => set('title', e.target.value)}
            onKeyDown={e => { if(e.key==='Enter'&&form.title.trim()) onSave(form); }}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 transition-colors" />

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/35 w-12 flex-shrink-0">日付</span>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-white/55">
            <input type="checkbox" checked={form.allDay} onChange={e => set('allDay', e.target.checked)} className="accent-blue-500 w-4 h-4" />
            終日
          </label>

          {!form.allDay && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/35 w-12 flex-shrink-0">時間</span>
              <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60" />
              <span className="text-white/25">→</span>
              <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60" />
            </div>
          )}

          {/* 繰り返し */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-white/35 w-12 flex-shrink-0 mt-2.5">繰り返し</span>
            <div className="flex-1 flex flex-col gap-1">
              <select value={recSelectValue()} onChange={handleRecSelect}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 cursor-pointer">
                <option value="none">繰り返しなし</option>
                <option value="daily">毎日</option>
                <option value="weekly">毎週 ({DAYS_JP[parseDate(form.date).getDay()]}曜日)</option>
                <option value="monthly">毎月</option>
                <option value="yearly">毎年</option>
                <option value="custom">カスタム...</option>
              </select>
              {form.recurrence && recSelectValue() === 'custom' && (
                <button onClick={() => setShowRecModal(true)}
                  className="text-xs text-blue-400 text-left px-1 hover:text-blue-300 transition-colors">
                  {recLabel(form.recurrence)}
                </button>
              )}
            </div>
          </div>

          {/* カラー */}
          <div>
            <div className="text-xs text-white/35 mb-2">カラー</div>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map(c => (
                <button key={c.val} title={c.label} onClick={() => set('color', c.val)}
                  className={`w-7 h-7 rounded-full transition-transform
                    ${form.color===c.val ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#181818]' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c.val }} />
              ))}
            </div>
          </div>

          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="説明（任意）"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 resize-none" />

          <div className="flex gap-2 justify-end mt-1">
            {onDelete && <button onClick={onDelete} className="px-4 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">削除</button>}
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/45 hover:bg-white/10 transition-colors">キャンセル</button>
            <button disabled={!form.title.trim()} onClick={() => onSave(form)}
              className="px-5 py-2 rounded-xl text-sm bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors">
              保存
            </button>
          </div>
        </div>
      </div>
      {showRecModal && (
        <RecurrenceModal
          initial={form.recurrence}
          baseDate={form.date}
          onApply={rule => { set('recurrence', rule); setShowRecModal(false); }}
          onClose={() => setShowRecModal(false)}
        />
      )}
    </>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ anchor, events, openCreate, openEdit }: {
  anchor: Date; events: CalendarEvent[];
  openCreate: (date: string) => void;
  openEdit: (ev: CalendarEvent) => void;
}) {
  const cells     = getMonthGrid(anchor);
  const today     = todayStr();
  const curMonth  = anchor.getMonth();
  const instances = expandAll(events, cells[0], cells[cells.length-1]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/10 flex-shrink-0">
        {DAYS_JP.map((d,i) => (
          <div key={d} className={`text-center text-xs py-2.5 font-medium tracking-wide
            ${i===0?'text-red-400/70':i===6?'text-blue-400/70':'text-white/30'}`}>{d}</div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto grid grid-cols-7"
        style={{ gridTemplateRows:`repeat(${cells.length/7},minmax(100px,1fr))` }}>
        {cells.map((cell,idx) => {
          const ds     = fmt(cell);
          const isToday= ds===today;
          const isCur  = cell.getMonth()===curMonth;
          const dow    = cell.getDay();
          const dayEvs = instances.filter(e=>e.date===ds);
          return (
            <div key={idx} onClick={() => openCreate(ds)}
              className={`border-b border-r border-white/[0.06] p-1.5 cursor-pointer hover:bg-white/[0.025] transition-colors flex flex-col gap-0.5 ${idx%7===0?'border-l':''}`}>
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium self-start mb-0.5
                ${isToday?'bg-blue-500 text-white':''}
                ${!isToday&&isCur?(dow===0?'text-red-400':dow===6?'text-blue-400':'text-white/80'):!isToday?'text-white/20':''}`}>
                {cell.getDate()}
              </div>
              {dayEvs.slice(0,3).map((ev,i) => (
                <div key={ev.id+'_'+i} onClick={e=>{e.stopPropagation();openEdit(ev);}}
                  className="text-[11px] px-1.5 py-[2px] rounded text-white truncate cursor-pointer hover:brightness-110 transition-all flex items-center gap-0.5"
                  style={{ backgroundColor: ev.color+'cc' }}>
                  {ev.recurrence && <span className="text-[9px] opacity-70">↻</span>}
                  {!ev.allDay&&ev.startTime&&<span className="opacity-60 mr-0.5 text-[10px]">{ev.startTime}</span>}
                  {ev.title}
                </div>
              ))}
              {dayEvs.length>3&&<div className="text-[10px] text-white/25 px-1">+{dayEvs.length-3}件</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid ────────────────────────────────────────────────────────────────
function TimeGridView({ days, events, openCreate, openEdit }: {
  days: Date[]; events: CalendarEvent[];
  openCreate: (date: string, startTime?: string) => void;
  openEdit: (ev: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today     = todayStr();
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 8*HOUR_PX; }, []);

  const instances = expandAll(events, days[0], days[days.length-1]);
  const timeEvs   = (ds:string) => instances.filter(e=>e.date===ds&&!e.allDay&&e.startTime);
  const allDayEvs = (ds:string) => instances.filter(e=>e.date===ds&&(e.allDay||!e.startTime));
  const hasAllDay = days.some(d=>allDayEvs(fmt(d)).length>0);
  const cols      = `56px repeat(${days.length},1fr)`;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b border-white/10 flex-shrink-0" style={{gridTemplateColumns:cols}}>
        <div className="border-r border-white/[0.06]" />
        {days.map((d,i)=>{
          const isToday=fmt(d)===today, dow=d.getDay();
          return (
            <div key={i} className="flex flex-col items-center py-2 border-r border-white/[0.06] last:border-r-0">
              <span className={`text-[11px] font-medium ${dow===0?'text-red-400/70':dow===6?'text-blue-400/70':'text-white/30'}`}>{DAYS_JP[dow]}</span>
              <div className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-semibold mt-0.5 ${isToday?'bg-blue-500 text-white':'text-white/75'}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {hasAllDay&&(
        <div className="grid border-b border-white/10 flex-shrink-0" style={{gridTemplateColumns:cols}}>
          <div className="border-r border-white/[0.06] flex items-center justify-end pr-2"><span className="text-[10px] text-white/20">終日</span></div>
          {days.map((d,i)=>(
            <div key={i} className="p-1 border-r border-white/[0.06] last:border-r-0 flex flex-col gap-0.5 min-h-[28px]">
              {allDayEvs(fmt(d)).map((ev,j)=>(
                <div key={ev.id+'_'+j} onClick={()=>openEdit(ev)}
                  className="text-[11px] px-2 py-0.5 rounded text-white truncate cursor-pointer hover:brightness-110 flex items-center gap-0.5"
                  style={{backgroundColor:ev.color+'cc'}}>
                  {ev.recurrence&&<span className="text-[9px] opacity-70">↻</span>}
                  {ev.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{gridTemplateColumns:cols,height:`${HOUR_PX*24}px`}}>
          {/* Hour labels */}
          <div className="relative border-r border-white/[0.06]">
            {HOURS.map(h=>(
              <div key={h} className="absolute right-2 text-[11px] text-white/20 select-none" style={{top:h*HOUR_PX-8}}>
                {h!==0?`${h}:00`:''}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((d,di)=>{
            const ds=fmt(d), isToday=ds===today;
            return (
              <div key={di} className={`relative border-r border-white/[0.06] last:border-r-0 cursor-pointer ${isToday?'bg-blue-500/[0.025]':''}`}
                onClick={e=>{
                  const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();
                  const totalMin=Math.round((e.clientY-rect.top)/HOUR_PX*60/15)*15;
                  const h=Math.floor(totalMin/60),m=totalMin%60;
                  openCreate(ds,`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
                }}>
                {HOURS.map(h=><div key={h} className="absolute inset-x-0 border-t border-white/[0.07]" style={{top:h*HOUR_PX}}/>)}
                {HOURS.map(h=><div key={h+'h'} className="absolute inset-x-0 border-t border-white/[0.03]" style={{top:h*HOUR_PX+HOUR_PX/2}}/>)}
                {timeEvs(ds).map((ev,j)=>{
                  const start=toMin(ev.startTime), end=ev.endTime?toMin(ev.endTime):start+60;
                  const top=(start/60)*HOUR_PX, height=Math.max(22,((end-start)/60)*HOUR_PX-2);
                  return (
                    <div key={ev.id+'_'+j} onClick={e=>{e.stopPropagation();openEdit(ev);}}
                      className="absolute inset-x-0.5 rounded px-1.5 py-0.5 text-white text-xs cursor-pointer hover:brightness-110 overflow-hidden border-l-2 transition-all z-10"
                      style={{top,height,backgroundColor:ev.color+'22',borderLeftColor:ev.color}}>
                      <p className="font-semibold text-[11px] truncate leading-tight flex items-center gap-0.5" style={{color:ev.color}}>
                        {ev.recurrence&&<span className="text-[9px]">↻</span>}
                        {ev.title}
                      </p>
                      <p className="text-[10px] text-white/50">{ev.startTime}{ev.endTime?` – ${ev.endTime}`:''}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view,   setView]   = useState<'month'|'week'|'day'>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [modal,  setModal]  = useState<{mode:'create'|'edit';data:Partial<CalendarEvent>&{date:string}}|null>(null);

  useEffect(() => { setEvents(Storage.load()); }, []);

  const saveEvents  = (evs: CalendarEvent[]) => { setEvents(evs); Storage.save(evs); };
  const addEvent    = (data: Omit<CalendarEvent,'id'>) => { saveEvents([...events,{...data,id:crypto.randomUUID()}]); setModal(null); };
  const updateEvent = (id: string, data: Omit<CalendarEvent,'id'>) => { saveEvents(events.map(e=>e.id===id?{...data,id}:e)); setModal(null); };
  const deleteEvent = (id: string) => { saveEvents(events.filter(e=>e.id!==id)); setModal(null); };

  const findBase = (inst: EventInstance) => events.find(e=>e.id===inst.id) ?? inst;

  const openCreate = (date: string, startTime?: string) => {
    const st = startTime||'09:00';
    const [h] = st.split(':').map(Number);
    const et = `${String(Math.min(h+1,23)).padStart(2,'0')}:00`;
    setModal({mode:'create',data:{...blankEvent(date),startTime:st,endTime:et}});
  };
  const openEdit = (ev: CalendarEvent) => setModal({mode:'edit',data:findBase(ev as EventInstance)});

  const navigate = (dir: -1|1) => {
    const d = new Date(anchor);
    if(view==='month') d.setMonth(d.getMonth()+dir);
    else if(view==='week') d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setAnchor(d);
  };

  const headerLabel = () => {
    const [y,m]=[anchor.getFullYear(),anchor.getMonth()];
    if(view==='month') return `${y}年 ${m+1}月`;
    if(view==='week'){
      const w=getWeekDays(anchor),s=w[0],e=w[6];
      return s.getMonth()===e.getMonth() ? `${y}年${m+1}月 ${s.getDate()}日〜${e.getDate()}日`
        : `${s.getFullYear()}年${s.getMonth()+1}月${s.getDate()}日 〜 ${e.getFullYear()}年${e.getMonth()+1}月${e.getDate()}日`;
    }
    return `${y}年${m+1}月${anchor.getDate()}日（${DAYS_JP[anchor.getDay()]}）`;
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0a0a0a] overflow-hidden text-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 h-14 border-b border-white/10 flex-shrink-0">
        <button onClick={() => setAnchor(new Date())}
          className="px-3 py-1.5 text-sm font-medium border border-white/15 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors mr-1">今日</button>
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white text-2xl leading-none transition-colors">‹</button>
        <button onClick={() => navigate(1)}  className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white text-2xl leading-none transition-colors">›</button>
        <span className="text-[15px] font-semibold text-white/90 flex-1 ml-1 select-none">{headerLabel()}</span>
        <div className="flex border border-white/10 rounded-lg overflow-hidden">
          {(['day','week','month'] as const).map(v=>(
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${view===v?'bg-blue-600 text-white':'text-white/45 hover:bg-white/10 hover:text-white'}`}>
              {{day:'日',week:'週',month:'月'}[v]}
            </button>
          ))}
        </div>
        <button onClick={() => openCreate(fmt(anchor))}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors ml-2">
          <span className="text-base leading-none font-bold">+</span> 作成
        </button>
      </div>

      {view==='month' && <MonthView    anchor={anchor} events={events} openCreate={openCreate} openEdit={openEdit} />}
      {view==='week'  && <TimeGridView days={getWeekDays(anchor)} events={events} openCreate={openCreate} openEdit={openEdit} />}
      {view==='day'   && <TimeGridView days={[anchor]}            events={events} openCreate={openCreate} openEdit={openEdit} />}

      {modal && (
        <EventModal
          initial={modal.data}
          onSave={data => modal.mode==='create' ? addEvent(data) : updateEvent((modal.data as CalendarEvent).id, data)}
          onDelete={modal.mode==='edit' ? () => deleteEvent((modal.data as CalendarEvent).id) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
