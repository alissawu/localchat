/**
 * Streaming chat engine.
 *
 * Handles three response formats:
 *  - openai:    SSE `data: {...}\n\n`, choices[0].delta.{content, tool_calls[]}
 *  - anthropic: SSE with named events (content_block_delta, message_delta, etc.)
 *  - ollama:    NDJSON lines with { message: { content }, done }
 *
 * Emits incremental deltas + a final aggregated tool-call (if any).
 */

import type { Message, Provider } from '../types';
import {
  anthropicTools,
  openaiTools,
  resolveProvider,
} from './providers';

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onToolCall: (call: { id: string; name: string; arguments: Record<string, unknown> }) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface StreamOptions {
  provider: Provider;
  messages: Message[];
  systemPrompt: string | null;
  toolsEnabled: boolean;
  reasoningEffort: 'default' | 'low' | 'high' | 'max';
  signal?: AbortSignal;
}

/** Approximate token count. ~4 chars/token in English. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

// Convert internal messages into OpenAI wire format.
function toOpenAIMessages(messages: Message[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.archived) continue;
    if (m.isToolResult && m.toolCallId) {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else if (m.isToolCall && m.toolCallId) {
      out.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: m.toolCallId,
            type: 'function',
            function: {
              name: m.toolName || 'unknown',
              arguments: JSON.stringify(m.toolArgs || {}),
            },
          },
        ],
      });
    } else if (m.isSummary) {
      out.push({ role: 'system', content: `[SUMMARY of prior context]\n${m.content}` });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

// Convert internal messages into Anthropic wire format.
function toAnthropicMessages(messages: Message[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.archived) continue;
    if (m.role === 'system') continue; // handled via top-level system
    if (m.isSummary) {
      out.push({
        role: 'user',
        content: [{ type: 'text', text: `[SUMMARY of prior context]\n${m.content}` }],
      });
      continue;
    }
    if (m.isToolCall && m.toolCallId) {
      out.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: m.toolCallId,
            name: m.toolName || 'unknown',
            input: m.toolArgs || {},
          },
        ],
      });
      continue;
    }
    if (m.isToolResult && m.toolCallId) {
      out.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content },
        ],
      });
      continue;
    }
    out.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
  }
  return out;
}

export async function streamChat(opts: StreamOptions, cb: StreamCallbacks): Promise<void> {
  const { provider, messages, systemPrompt, toolsEnabled, reasoningEffort, signal } = opts;
  const { cfg, endpoint, model } = resolveProvider(provider);

  let body: Record<string, unknown>;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cfg.authHeader(provider.key),
  };

  if (cfg.format === 'anthropic') {
    body = {
      model,
      max_tokens: 4096,
      stream: true,
      messages: toAnthropicMessages(messages),
    };
    if (systemPrompt) body.system = systemPrompt;
    if (toolsEnabled && cfg.supportsTools) body.tools = anthropicTools;
  } else if (cfg.format === 'ollama') {
    body = {
      model,
      stream: true,
      messages: messages
        .filter((m) => !m.archived)
        .map((m) => ({
          role: m.isSummary ? 'system' : m.role,
          content: m.content,
        })),
    };
  } else {
    body = {
      model,
      stream: true,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(messages)]
        : toOpenAIMessages(messages),
    };
    if (toolsEnabled && cfg.supportsTools) body.tools = openaiTools;
    if (reasoningEffort !== 'default') {
      const wantsReason =
        ['kimi', 'deepseek', 'openrouter'].includes(provider.type) ||
        model.includes('kimi') ||
        model.includes('deepseek') ||
        model.startsWith('o');
      if (wantsReason) body.reasoning_effort = reasoningEffort;
    }
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    cb.onError(e as Error);
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    cb.onError(new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Tool call aggregation state (OpenAI). Anthropic aggregates via input_json_delta.
  const pendingToolCalls = new Map<
    number,
    { id: string; name: string; argsText: string }
  >();
  // Anthropic: per content block
  const anthropicBlocks = new Map<number, { type: string; id?: string; name?: string; argsText: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      if (cfg.format === 'ollama') {
        // NDJSON: line-by-line
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            const delta = j?.message?.content;
            if (delta) cb.onDelta(delta);
            if (j?.done) {
              cb.onDone();
              return;
            }
          } catch {
            /* ignore parse errors */
          }
        }
      } else {
        // SSE: event separated by \n\n
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          handleSSEChunk(chunk, cfg.format, cb, pendingToolCalls, anthropicBlocks);
        }
      }
    }
    // Flush any trailing OpenAI tool calls
    for (const [, tc] of pendingToolCalls) {
      if (tc.name) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.argsText || '{}');
        } catch {
          args = { _raw: tc.argsText };
        }
        cb.onToolCall({ id: tc.id, name: tc.name, arguments: args });
      }
    }
    cb.onDone();
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    cb.onError(e as Error);
  }
}

function handleSSEChunk(
  chunk: string,
  format: 'openai' | 'anthropic',
  cb: StreamCallbacks,
  pendingToolCalls: Map<number, { id: string; name: string; argsText: string }>,
  anthropicBlocks: Map<number, { type: string; id?: string; name?: string; argsText: string }>,
) {
  const lines = chunk.split('\n');
  let eventName = '';
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataParts.push(line.slice(5).trim());
  }
  const dataStr = dataParts.join('\n');
  if (!dataStr) return;
  if (dataStr === '[DONE]') return;

  let data: any;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  if (format === 'openai') {
    const choice = data.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.content) cb.onDelta(delta.content);
    if (Array.isArray(delta?.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const existing = pendingToolCalls.get(idx) || { id: '', name: '', argsText: '' };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.argsText += tc.function.arguments;
        pendingToolCalls.set(idx, existing);
      }
    }
  } else {
    // anthropic
    const type = data.type || eventName;
    if (type === 'content_block_start') {
      const block = data.content_block;
      anthropicBlocks.set(data.index, {
        type: block.type,
        id: block.id,
        name: block.name,
        argsText: '',
      });
    } else if (type === 'content_block_delta') {
      const d = data.delta;
      if (d?.type === 'text_delta' && d.text) cb.onDelta(d.text);
      else if (d?.type === 'input_json_delta') {
        const b = anthropicBlocks.get(data.index);
        if (b) b.argsText += d.partial_json || '';
      }
    } else if (type === 'content_block_stop') {
      const b = anthropicBlocks.get(data.index);
      if (b && b.type === 'tool_use' && b.name && b.id) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(b.argsText || '{}');
        } catch {
          args = { _raw: b.argsText };
        }
        cb.onToolCall({ id: b.id, name: b.name, arguments: args });
      }
    }
  }
}
