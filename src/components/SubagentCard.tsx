import clsx from 'clsx';
import type { SubagentTask } from '../types';

/**
 * Placeholder for future subagent feature. Renders a compact card representing
 * an ephemeral background task (its context is discarded on completion; only
 * the summarized result may be pulled into the main conversation).
 */
export default function SubagentCard({
  task,
  onAddToContext,
}: {
  task: SubagentTask;
  onAddToContext?: (result: string) => void;
}) {
  const badge =
    task.status === 'running' ? 'running' :
    task.status === 'done' ? 'done' :
    task.status === 'error' ? 'error' : 'pending';
  const badgeColor =
    task.status === 'running' ? 'text-amber border-amber/40' :
    task.status === 'done' ? 'text-moss border-moss/40' :
    task.status === 'error' ? 'text-crimson border-crimson/40' :
    'text-dust border-hairline';

  return (
    <div className="my-1 rounded-sm border border-hairline bg-graphite/60 px-2 py-2">
      <div className="flex items-center justify-between">
        <span className={clsx('rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.16em]', badgeColor)}>
          {badge}
        </span>
        {task.status === 'running' && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
        )}
      </div>
      <div className="mt-1.5 truncate text-[12px] text-parchment">{task.prompt}</div>
      {task.result && (
        <details className="mt-1">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-ash hover:text-amber">
            result
          </summary>
          <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-parchment">
            {task.result}
          </div>
          {onAddToContext && (
            <button
              onClick={() => onAddToContext(task.result!)}
              className="mt-1 font-mono text-[10px] uppercase tracking-wider text-amber hover:underline"
            >
              add to context →
            </button>
          )}
        </details>
      )}
    </div>
  );
}
