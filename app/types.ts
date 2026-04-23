export type Note = {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  updatedAt: number;
  type?: 'document' | 'board' | 'daily';
  color?: string;
  is_deleted?: boolean;
  order_index?: number;
};

export type Tab = {
  id: string | null;
  title: string;
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
