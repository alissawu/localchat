import type { Message, Provider } from '../types';
import { resolveProvider } from './providers';

export async function generateSummary(
  provider: Provider,
  messagesToSummarize: Message[],
): Promise<string> {
  const { cfg, endpoint, model } = resolveProvider(provider);
  const promptText =
    'Summarize the following conversation concisely, preserving key facts, decisions, legal points, and context that would be needed to continue the discussion:\n\n' +
    messagesToSummarize.map((m) => `${m.role}: ${m.content}`).join('\n\n');

  let body: Record<string, unknown>;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cfg.authHeader(provider.key),
  };

  if (cfg.format === 'anthropic') {
    body = {
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: promptText }],
    };
  } else if (cfg.format === 'ollama') {
    body = {
      model,
      stream: false,
      messages: [{ role: 'user', content: promptText }],
    };
  } else {
    body = {
      model,
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 1024,
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Summary failed: ${res.status}`);
  const data = await res.json();

  if (cfg.format === 'anthropic') {
    const text = data.content?.find((c: any) => c.type === 'text');
    return text?.text || '';
  } else if (cfg.format === 'ollama') {
    return data.message?.content || '';
  } else {
    return data.choices?.[0]?.message?.content || '';
  }
}
