"use client";

import { Note } from '../types';

// ── Inline token types ────────────────────────────────────────────────────────
type InlineToken =
  | { type: 'bold';     text: string }
  | { type: 'italic';   text: string }
  | { type: 'code';     text: string }
  | { type: 'wikilink'; title: string; noteId: string | null }
  | { type: 'url';      href: string }
  | { type: 'text';     text: string };

// ── Inline parser ─────────────────────────────────────────────────────────────
function parseInline(text: string, notes: Note[]): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: bold before italic to avoid false match on single *
  const regex = /(\*\*(.+?)\*\*|\*([^*]+)\*|`([^`]+)`|\[\[([^\]]+)\]\]|(https?:\/\/[^\s]+))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) {
      tokens.push({ type: 'bold', text: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'italic', text: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'code', text: match[4] });
    } else if (match[5] !== undefined) {
      const title = match[5].trim();
      const note = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
      tokens.push({ type: 'wikilink', title, noteId: note?.id ?? null });
    } else if (match[6] !== undefined) {
      tokens.push({ type: 'url', href: match[6] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }
  return tokens;
}

// ── Inline token renderer ─────────────────────────────────────────────────────
function InlineTokens({
  tokens, notes, onNavigate,
}: {
  tokens: InlineToken[];
  notes: Note[];
  onNavigate: (noteId: string, title: string) => void;
}) {
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'bold')
          return <strong key={i} className="font-bold text-white">{token.text}</strong>;

        if (token.type === 'italic')
          return <em key={i} className="italic text-white/90">{token.text}</em>;

        if (token.type === 'code')
          return (
            <code key={i} className="bg-white/10 text-blue-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
              {token.text}
            </code>
          );

        if (token.type === 'wikilink') {
          if (token.noteId) {
            return (
              <button
                key={i}
                className="text-blue-400 hover:text-blue-200 underline decoration-dotted underline-offset-2 px-0 transition-colors"
                onClick={(e) => { e.stopPropagation(); onNavigate(token.noteId!, token.title); }}
              >
                {token.title}
              </button>
            );
          }
          // Non-existent page → orange dashed
          return (
            <span key={i} className="text-orange-400/80 border-b border-dashed border-orange-400/40 cursor-not-allowed">
              {token.title}
            </span>
          );
        }

        if (token.type === 'url')
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline break-all"
              onClick={e => e.stopPropagation()}
            >
              {token.href}
            </a>
          );

        // plain text
        return <span key={i}>{(token as { type: 'text'; text: string }).text}</span>;
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MarkdownRenderer({
  content,
  notes,
  onNavigate,
  onContentChange,
}: {
  content: string;
  notes: Note[];
  onNavigate: (noteId: string, title: string) => void;
  onContentChange?: (newContent: string) => void;
}) {
  const lines = content.split('\n');

  const toggleTodo = (lineIndex: number, currentlyChecked: boolean) => {
    if (!onContentChange) return;
    const newLines = lines.map((l, i) => {
      if (i !== lineIndex) return l;
      if (currentlyChecked) return l.replace(/^- \[x\] /i, '- [ ] ');
      return l.replace(/^- \[ \] /, '- [x] ');
    });
    onContentChange(newLines.join('\n'));
  };

  return (
    <div className="leading-relaxed">
      {lines.map((line, lineIndex) => {
        // ── Headings ──
        if (line.startsWith('# ')) {
          return (
            <h1 key={lineIndex} className="text-2xl font-bold text-white mt-6 mb-2 pb-2 border-b border-white/10">
              <InlineTokens tokens={parseInline(line.slice(2), notes)} notes={notes} onNavigate={onNavigate} />
            </h1>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={lineIndex} className="text-xl font-bold text-white mt-5 mb-1">
              <InlineTokens tokens={parseInline(line.slice(3), notes)} notes={notes} onNavigate={onNavigate} />
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={lineIndex} className="text-lg font-semibold text-white/90 mt-4 mb-1">
              <InlineTokens tokens={parseInline(line.slice(4), notes)} notes={notes} onNavigate={onNavigate} />
            </h3>
          );
        }

        // ── Horizontal Rule ──
        if (/^---+$/.test(line.trim())) {
          return <hr key={lineIndex} className="border-white/10 my-6" />;
        }

        // ── Todo unchecked ──
        const unchecked = line.match(/^- \[ \] (.*)/);
        if (unchecked) {
          return (
            <div key={lineIndex} className="flex items-center gap-2.5 py-0.5">
              <button
                className="w-4 h-4 flex-shrink-0 rounded border border-white/30 hover:border-blue-400 bg-transparent transition-colors"
                onClick={(e) => { e.stopPropagation(); toggleTodo(lineIndex, false); }}
              />
              <span className="text-white/80">
                <InlineTokens tokens={parseInline(unchecked[1], notes)} notes={notes} onNavigate={onNavigate} />
              </span>
            </div>
          );
        }

        // ── Todo checked ──
        const checked = line.match(/^- \[x\] (.*)/i);
        if (checked) {
          return (
            <div key={lineIndex} className="flex items-center gap-2.5 py-0.5">
              <button
                className="w-4 h-4 flex-shrink-0 rounded bg-blue-500 border border-blue-500 flex items-center justify-center transition-colors"
                onClick={(e) => { e.stopPropagation(); toggleTodo(lineIndex, true); }}
              >
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <span className="text-white/35 line-through">
                <InlineTokens tokens={parseInline(checked[1], notes)} notes={notes} onNavigate={onNavigate} />
              </span>
            </div>
          );
        }

        // ── Bullet list ──
        if (/^- /.test(line)) {
          return (
            <div key={lineIndex} className="flex items-start gap-2.5 py-0.5">
              <span className="text-white/40 mt-2 text-[7px] flex-shrink-0 leading-none">●</span>
              <span className="text-white/80">
                <InlineTokens tokens={parseInline(line.slice(2), notes)} notes={notes} onNavigate={onNavigate} />
              </span>
            </div>
          );
        }

        // ── Empty line ──
        if (line.trim() === '') {
          return <div key={lineIndex} className="h-4" />;
        }

        // ── Regular paragraph ──
        return (
          <p key={lineIndex} className="text-white/90 py-0.5">
            <InlineTokens tokens={parseInline(line, notes)} notes={notes} onNavigate={onNavigate} />
          </p>
        );
      })}
    </div>
  );
}
