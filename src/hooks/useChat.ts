import { useCallback, useRef, useState } from 'react';
import type { Message, Settings, Provider } from '../types';
import { estimateTokens, streamChat } from '../lib/stream';
import { runSubagent } from '../lib/subagent';

interface UseChatArgs {
  messagesRef: React.MutableRefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  settingsRef: React.MutableRefObject<Settings>;
}

let idSeq = Date.now();
const nextId = () => ++idSeq;

async function runTool(
  name: string,
  args: Record<string, unknown>,
  provider: Provider,
): Promise<string> {
  try {
    if (name === 'web_search')
      return await window.api.webSearch(String(args.query || ''));
    if (name === 'web_fetch')
      return await window.api.webFetch(String(args.url || ''));
    if (name === 'spawn_subagent')
      return await runSubagent(provider, String(args.prompt || ''));
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${(e as Error).message}`;
  }
}

export function useChat({ messagesRef, setMessages, settingsRef }: UseChatArgs) {
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentProvider = useCallback((): Provider | null => {
    const s = settingsRef.current;
    return s.providers.find((p) => p.id === s.activeProvider) || null;
  }, [settingsRef]);

  // Update a message by id
  const patchMessage = useCallback(
    (id: number, patch: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [setMessages],
  );

  const appendMessage = useCallback(
    (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    },
    [setMessages],
  );

  // Runs one turn: stream -> if tool call, execute, recurse. Otherwise finalize.
  const runTurn = useCallback(async () => {
    const provider = currentProvider();
    if (!provider) throw new Error('No provider selected');
    const s = settingsRef.current;

    // Load base prompt fresh each turn (from SYSTEMPROMPT.md)
    const basePrompt = await window.api.loadBasePrompt();
    // Combine: base prompt + settings prompt (if strict mode)
    let systemPrompt: string | null = null;
    if (basePrompt && s.strictMode && s.systemPrompt) {
      systemPrompt = `${basePrompt}\n\n${s.systemPrompt}`;
    } else if (basePrompt) {
      systemPrompt = basePrompt;
    } else if (s.strictMode && s.systemPrompt) {
      systemPrompt = s.systemPrompt;
    }

    // Placeholder assistant message we'll stream into.
    const streamMsg: Message = {
      id: nextId(),
      role: 'assistant',
      content: '',
      tokens: 0,
      streaming: true,
      createdAt: Date.now(),
    };
    appendMessage(streamMsg);

    let acc = '';
    let toolCalled:
      | { id: string; name: string; arguments: Record<string, unknown> }
      | null = null;

    const ac = new AbortController();
    abortRef.current = ac;

    await streamChat(
      {
        provider,
        messages: messagesRef.current.filter((m) => m.id !== streamMsg.id),
        systemPrompt,
        toolsEnabled: s.strictMode,
        reasoningEffort: s.reasoningEffort,
        signal: ac.signal,
      },
      {
        onDelta: (text) => {
          acc += text;
          // Update the placeholder incrementally
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsg.id
                ? { ...m, content: acc, tokens: estimateTokens(acc) }
                : m,
            ),
          );
        },
        onToolCall: (tc) => {
          toolCalled = tc;
        },
        onDone: () => {},
        onError: (err) => {
          patchMessage(streamMsg.id, {
            content: acc + (acc ? '\n\n' : '') + `⚠ ${err.message}`,
            streaming: false,
            error: true,
          });
        },
      },
    );

    // If nothing streamed and we got a tool call: remove placeholder, add tool call msg.
    if (toolCalled) {
      const call = toolCalled as { id: string; name: string; arguments: Record<string, unknown> };
      if (!acc) {
        setMessages((prev) => prev.filter((m) => m.id !== streamMsg.id));
      } else {
        patchMessage(streamMsg.id, { streaming: false });
      }

      const callMsg: Message = {
        id: nextId(),
        role: 'assistant',
        content: '',
        tokens: 8,
        isToolCall: true,
        toolCallId: call.id,
        toolName: call.name,
        toolArgs: call.arguments,
        createdAt: Date.now(),
      };
      appendMessage(callMsg);
      setToolStatus(
        call.name === 'spawn_subagent'
          ? `researching · ${String(call.arguments.prompt || '').slice(0, 70)}`
          : `${call.name} → ${JSON.stringify(call.arguments).slice(0, 80)}`,
      );

      const result = await runTool(call.name, call.arguments, provider);
      setToolStatus(null);

      const resultMsg: Message = {
        id: nextId(),
        role: 'tool',
        content: result,
        tokens: estimateTokens(result),
        isToolResult: true,
        toolCallId: call.id,
        toolName: call.name,
        createdAt: Date.now(),
      };
      appendMessage(resultMsg);

      // Recurse
      await runTurn();
      return;
    }

    patchMessage(streamMsg.id, { streaming: false });
  }, [appendMessage, currentProvider, messagesRef, patchMessage, setMessages, settingsRef]);

  const send = useCallback(
    async (text: string) => {
      const provider = currentProvider();
      if (!provider) throw new Error('No provider selected');
      const userMsg: Message = {
        id: nextId(),
        role: 'user',
        content: text,
        tokens: estimateTokens(text),
        createdAt: Date.now(),
      };
      appendMessage(userMsg);
      setStreaming(true);
      try {
        await runTurn();
      } finally {
        setStreaming(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [appendMessage, currentProvider, runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setToolStatus(null);
  }, []);

  return { send, stop, streaming, toolStatus };
}
