import { memo } from 'react';
import clsx from 'clsx';
import type { Message } from '../types';

interface Props {
  message: Message;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

function formatContent(text: string) {
  // Extremely light markdown: paragraphs, `code`, ```blocks```
  // Split code blocks first
  const parts: Array<{ type: 'code' | 'text'; text: string }> = [];
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    parts.push({ type: 'code', text: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === 'code') {
      return <pre key={i}>{p.text}</pre>;
    }
    // Inline code + links + paragraphs
    const paras = p.text.split(/\n{2,}/);
    return paras.map((para, j) => (
      <p key={`${i}-${j}`}>{renderInline(para)}</p>
    ));
  });
}

function renderInline(text: string) {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<code key={key++}>{m[1].slice(1, -1)}</code>);
    else if (m[2])
      out.push(
        <a key={key++} href={m[2]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  // Preserve single newlines
  return out.map((n, i) =>
    typeof n === 'string' ? (
      <span key={i}>
        {n.split('\n').map((line, k, arr) => (
          <span key={k}>
            {line}
            {k < arr.length - 1 && <br />}
          </span>
        ))}
      </span>
    ) : (
      n
    ),
  );
}

const MessageComponent = ({ message, selected, onToggleSelect, onDelete }: Props) => {
  const { role, isSummary, isToolCall, isToolResult, streaming, error } = message;

  if (isToolCall) {
    return (
      <div className="rise mx-auto my-2 max-w-3xl px-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ash">
          <span className="font-mono text-amber">→</span>
          <span className="font-mono text-parchment">{message.toolName}</span>
          <span className="text-ash">calling</span>
          <span className="truncate font-mono text-dust">
            {JSON.stringify(message.toolArgs || {})}
          </span>
        </div>
      </div>
    );
  }

  if (isToolResult) {
    return (
      <div className="rise mx-auto my-2 max-w-3xl px-4">
        <details className="rounded-md border border-hairline bg-slate/60 text-[13px] group">
          <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ash flex items-center justify-between">
            <span>{message.toolName ?? 'tool'} result · {message.tokens}t</span>
            <span className="text-dust group-open:rotate-90 transition-transform">›</span>
          </summary>
          <pre className="max-h-64 overflow-auto px-3 pb-3 pt-1 font-mono text-[12px] text-parchment whitespace-pre-wrap">
            {message.content}
          </pre>
        </details>
      </div>
    );
  }

  if (isSummary) {
    return (
      <div className="rise mx-auto my-3 max-w-3xl px-4">
        <div className="relative rounded-md border border-amber/30 bg-amber/[0.04] px-4 py-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-amber">
            Summary · replaces {message.summarizedCount ?? '?'} messages · {message.tokens}t
          </div>
          <div className="font-serif italic text-parchment leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const isUser = role === 'user';

  return (
    <div className={clsx('rise group mx-auto flex max-w-3xl gap-3 px-4 py-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <button
        onClick={() => onToggleSelect(message.id)}
        className={clsx(
          'mt-2 h-3.5 w-3.5 shrink-0 rounded-sm border transition',
          selected ? 'border-amber bg-amber' : 'border-fog hover:border-ash',
        )}
        title="Select"
      />
      <div className={clsx('min-w-0 flex-1', isUser && 'flex justify-end')}>
        <div
          className={clsx(
            'inline-block max-w-full rounded-lg px-4 py-2.5 text-[14.5px] leading-relaxed',
            isUser
              ? 'bg-fog text-bone'
              : 'text-parchment',
            error && 'border border-crimson/40 bg-crimson/[0.06]',
          )}
        >
          <div className={clsx('prose-body break-words', streaming && !message.content && 'caret')}>
            {formatContent(message.content || '')}
            {streaming && message.content && <span className="caret" />}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3 opacity-0 transition group-hover:opacity-100">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dust">
            {message.tokens}t
          </span>
          <button
            onClick={() => onDelete(message.id)}
            className="font-mono text-[10px] uppercase tracking-wider text-dust hover:text-crimson"
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(MessageComponent);
