import clsx from 'clsx';
import type { Message, Provider, SubagentTask } from '../types';
import SubagentCard from './SubagentCard';

interface Props {
  messages: Message[];
  selectedIds: Set<number>;
  onScrollTo: (id: number) => void;
  onSummarizeAll: () => void;
  onSummarizeSelected: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenWipe: () => void;
  providers: Provider[];
  activeProviderId: string | null;
  onSelectProvider: (id: string | null) => void;
  subagents: SubagentTask[];
}

export default function Sidebar({
  messages,
  selectedIds,
  onScrollTo,
  onSummarizeAll,
  onSummarizeSelected,
  onNewChat,
  onOpenSettings,
  onOpenWipe,
  providers,
  activeProviderId,
  onSelectProvider,
  subagents,
}: Props) {
  const totalTokens = messages.reduce((s, m) => s + (m.tokens || 0), 0);
  const canSelected = selectedIds.size >= 2;

  return (
    <aside className="drag flex w-[300px] shrink-0 flex-col border-r border-hairline bg-slate/50">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-baseline justify-between">
          <div className="font-serif text-[22px] italic tracking-tight text-parchment">
            localchat
          </div>
          <button
            onClick={onNewChat}
            className="no-drag font-mono text-[10px] uppercase tracking-[0.18em] text-ash hover:text-amber"
            title="New conversation"
          >
            new
          </button>
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-dust">
          v1 · encrypted at rest
        </div>
      </div>

      {/* Provider picker */}
      <div className="no-drag px-5 pb-4">
        <select
          value={activeProviderId ?? ''}
          onChange={(e) => onSelectProvider(e.target.value || null)}
          className="ring-focus w-full rounded-sm border border-hairline bg-graphite px-2 py-1.5 font-mono text-[12px] text-parchment"
        >
          <option value="">— select provider —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.type}
            </option>
          ))}
        </select>
      </div>

      {/* Context stats */}
      <div className="no-drag px-5 pb-3">
        <div className="rounded-md border border-hairline bg-graphite/60 px-3 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-dust">
              context
            </span>
            <span className="font-mono text-[11px] text-ash">{messages.length} msgs</span>
          </div>
          <div className="mt-1 font-serif text-[26px] text-parchment">
            {totalTokens.toLocaleString()}
            <span className="ml-1 text-[13px] text-dust">tokens</span>
          </div>
          <TokenBar tokens={totalTokens} />
        </div>
      </div>

      <div className="no-drag flex gap-2 px-5 pb-4">
        <button
          onClick={onSummarizeAll}
          disabled={messages.length < 2}
          className="flex-1 rounded-sm border border-hairline bg-graphite px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-parchment transition hover:border-amber/50 hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
        >
          Summarize all
        </button>
        <button
          onClick={onSummarizeSelected}
          disabled={!canSelected}
          className="flex-1 rounded-sm border border-hairline bg-graphite px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-parchment transition hover:border-amber/50 hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
        >
          Selected ({selectedIds.size})
        </button>
      </div>

      {/* Context list */}
      <div className="no-drag flex-1 overflow-y-auto px-3 pb-3">
        <div className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-dust">
          Timeline
        </div>
        {messages.length === 0 && (
          <div className="px-2 py-3 font-serif text-[13px] italic text-dust">
            nothing yet.
          </div>
        )}
        {messages.map((m) => (
          <ContextItem
            key={m.id}
            message={m}
            selected={selectedIds.has(m.id)}
            onClick={() => onScrollTo(m.id)}
          />
        ))}

        {subagents.length > 0 && (
          <>
            <div className="mt-4 px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-dust">
              Subagents
            </div>
            {subagents.map((s) => (
              <SubagentCard key={s.id} task={s} />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="no-drag flex gap-2 border-t border-hairline px-5 py-3">
        <button
          onClick={onOpenSettings}
          className="flex-1 rounded-sm border border-hairline bg-graphite px-2 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-parchment hover:border-amber/50 hover:text-amber"
        >
          Settings
        </button>
        <button
          onClick={onOpenWipe}
          className="rounded-sm border border-crimson/40 bg-crimson/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-crimson hover:bg-crimson/20"
        >
          Wipe
        </button>
      </div>
    </aside>
  );
}

function ContextItem({
  message,
  selected,
  onClick,
}: {
  message: Message;
  selected: boolean;
  onClick: () => void;
}) {
  let icon = '·';
  let color = 'text-dust';
  if (message.role === 'user') { icon = 'u'; color = 'text-ash'; }
  else if (message.role === 'assistant') { icon = 'a'; color = 'text-parchment'; }
  else if (message.isToolCall) { icon = '→'; color = 'text-amber'; }
  else if (message.isToolResult) { icon = '⌐'; color = 'text-moss'; }
  else if (message.isSummary) { icon = '∑'; color = 'text-amber'; }

  const preview = (message.content || '').slice(0, 60).replace(/\s+/g, ' ');
  return (
    <button
      onClick={onClick}
      className={clsx(
        'group my-0.5 flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition',
        selected ? 'bg-amber/10' : 'hover:bg-graphite/70',
      )}
    >
      <span className={clsx('mt-0.5 w-3 shrink-0 font-mono text-[11px]', color)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-parchment">{preview || '…'}</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-dust">
          {message.tokens}t {message.isSummary && `· replaces ${message.summarizedCount ?? '?'}`}
        </div>
      </div>
    </button>
  );
}

function TokenBar({ tokens }: { tokens: number }) {
  const cap = 128_000;
  const pct = Math.min(100, (tokens / cap) * 100);
  const zone = pct < 50 ? 'bg-moss' : pct < 80 ? 'bg-amber' : 'bg-crimson';
  return (
    <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-fog">
      <div className={clsx('h-full transition-all', zone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
