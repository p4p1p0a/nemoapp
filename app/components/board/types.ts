// ── Board-specific types & constants ─────────────────────────────────────────

export type Point = { x: number; y: number };
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type ToolType = 'select' | 'pan' | 'pen' | 'eraser' | 'text' | 'arrow' | 'rect' | 'ellipse';

export type Stroke = {
  id: string;
  points: Point[];
  color: string;
  width: number;
  groupId?: string;
};

export type RectNode = {
  id: string;
  type: 'image' | 'youtube' | 'page' | 'text' | 'rect' | 'ellipse' | 'note';
  x: number;
  y: number;
  width: number;
  height: number;
  data: string;
  color?: string;
  fontSize?: number;
  fillColor?: string;
  strokeWidth?: number;
  groupId?: string;
};

export type Edge = {
  id: string;
  fromNodeId: string;
  fromSide?: Side;
  toNodeId: string;
  toSide?: Side;
  /** Bezier control point near the from-node */
  cp1?: Point;
  /** Bezier control point near the to-node */
  cp2?: Point;
  color?: string;
  strokeWidth?: number;
  showArrow?: boolean;
  groupId?: string;
};

export type BoardData = {
  strokes: Stroke[];
  nodes?: RectNode[];
  edges?: Edge[];
  groups?: { id: string; name?: string }[];
};

export const COLORS: { id: string; hex: string }[] = [
  { id: 'white',  hex: '#ffffff' },
  { id: 'red',    hex: '#ff4b4b' },
  { id: 'green',  hex: '#4bff5a' },
  { id: 'blue',   hex: '#4b83ff' },
  { id: 'yellow', hex: '#ffeb3b' },
];
