import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import type { Message } from '../types';
import MessageView from './Message';

interface Props {
  messages: Message[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onSend: (text: string) => Promise<void> | void;
  onStop: () => void;
  streaming: boolean;
  toolStatus: string | null;
  hasProvider: boolean;
  reasoningEffort: 'default' | 'low' | 'high' | 'max';
  onReasoningChange: (v: 'default' | 'low' | 'high' | 'max') => void;
  providerName: string | null;
}

export default function Chat({
  messages,
  selectedIds,
  onToggleSelect,
  onDelete,
  onSend,
  onStop,
  streaming,
  toolStatus,
  hasProvider,
  reasoningEffort,
  onReasoningChange,
  providerName,
}: Props) {
  const [input, setInput] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (i) => messages[i].id,
  });

  // Auto-scroll to bottom during streaming or when new msgs arrive if we're near bottom
  useEffect(() => {
    if (!parentRef.current) return;
    if (atBottom || streaming) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages.length, streaming, atBottom, virtualizer]);

  // Track streaming content growth to keep pinned
  const lastContentLen = useRef(0);
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (streaming && lastMsg && atBottom) {
      const len = lastMsg.content?.length ?? 0;
      if (len !== lastContentLen.current) {
        lastContentLen.current = len;
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      }
    }
  }, [lastMsg?.content, streaming, atBottom, virtualizer, messages.length, lastMsg]);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distanceFromBottom < 60);
  }, []);

  const submit = useCallback(async () => {
    const t = input.trim();
    if (!t || streaming || !hasProvider) return;
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    await onSend(t);
  }, [input, streaming, hasProvider, onSend]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [input]);

  const items = virtualizer.getVirtualItems();

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="drag flex items-center justify-between border-b border-hairline px-6 py-3">
        <div className="no-drag flex items-center gap-4">
          <div className="font-serif text-[15px] italic text-parchment">
            {providerName ?? <span className="text-dust">No provider selected</span>}
          </div>
          <div className="flex items-center gap-1 rounded-sm border border-hairline bg-slate/60 px-1 py-[3px] font-mono text-[10px] uppercase tracking-[0.16em]">
            {(['low', 'high', 'max'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onReasoningChange(v)}
                className={clsx(
                  'px-2 py-[3px] rounded-[2px] transition',
                  reasoningEffort === v ? 'bg-amber text-ink' : 'text-ash hover:text-parchment',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {toolStatus && (
          <div className="no-drag flex items-center gap-2 font-mono text-[11px] text-amber">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
            {toolStatus}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {items.map((v) => {
              const m = messages[v.index];
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${v.start}px)`,
                  }}
                >
                  <MessageView
                    message={m}
                    selected={selectedIds.has(m.id)}
                    onToggleSelect={onToggleSelect}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-hairline bg-slate/40 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <div className="flex-1 rounded-md border border-hairline bg-graphite focus-within:border-amber/60 transition">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={hasProvider ? 'Ask something…' : 'Configure a provider in Settings to begin.'}
              rows={1}
              disabled={!hasProvider}
              className="ring-focus block w-full resize-none bg-transparent px-4 py-3 text-[14.5px] text-bone placeholder:text-dust focus:outline-none"
            />
          </div>
          {streaming ? (
            <button
              onClick={onStop}
              className="rounded-md border border-crimson/50 bg-crimson/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-crimson hover:bg-crimson/20"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim() || !hasProvider}
              className="rounded-md bg-amber px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition hover:bg-amber-2 disabled:cursor-not-allowed disabled:bg-fog disabled:text-dust"
            >
              Send ↵
            </button>
          )}
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-dust">
          <span>Enter to send · Shift+Enter for newline</span>
          <span>Encrypted · local only</span>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.32em] text-dust">
        Local · Encrypted · Ephemeral
      </div>
      <h1 className="max-w-md font-serif text-4xl font-normal leading-tight text-parchment">
        A quiet room for careful thinking.
      </h1>
      <p className="mt-4 max-w-md text-[14px] text-ash">
        Nothing leaves this machine except the API call you consent to. Everything at rest is
        encrypted. You control the context that reaches the model.
      </p>
    </div>
  );
}
