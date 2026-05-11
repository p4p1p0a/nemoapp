export type Note = {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  updatedAt: number;
  type?: 'document' | 'board' | 'daily';
  color?: string;
  emoji?: string;
  is_deleted?: boolean;
  order_index?: number;
};

export type WinState = 'normal' | 'minimized' | 'maximized';

export type AppWindowData = {
  id: string;          // note.id | '__calendar__'
  title: string;
  noteType?: 'document' | 'board' | 'daily' | 'calendar';
  state: WinState;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isPinned?: boolean;  // true = タスクバーから消えない（カレンダー用）
  /** maximized 前の状態を保存 */
  prevRect?: { x: number; y: number; width: number; height: number };
};

export type DesktopShortcut = {
  id: string;
  noteId: string;
  x: number;
  y: number;
};

export type Genre = {
  id: string;
  name: string;
  color: string;
  updatedAt: number;
  is_deleted?: boolean;
};

// ── Calendar Types ────────────────────────────────────────────────────────────
export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year';

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval: number;
  byDay?: number[];
  endType: 'never' | 'date' | 'count';
  endDate?: string;
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
  linkedNoteId?: string;
  genreId?: string;
  excludedDates?: string[];
  updatedAt: number;
  is_deleted?: boolean;
};
