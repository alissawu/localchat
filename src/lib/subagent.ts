import type { Provider } from '../types';
import { resolveProvider } from './providers';

/**
 * Build a single-shot, tool-less completion request for a subagent and hand it
 * to the main process to execute. Non-streaming: the subagent runs as a
 * discrete side quest whose result is fed back to the main model as a tool
 * result. The subagent has no tools of its own — no recursion, no runaway.
 */
export async function runSubagent(
  provider: Provider,
  prompt: string,
): Promise<string> {
  const { cfg, endpoint, model } = resolveProvider(provider);
  const headers: Record<string, string> = cfg.authHeader(provider.key);

  let body: Record<string, unknown>;
  if (cfg.format === 'anthropic') {
    body = {
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    };
  } else if (cfg.format === 'ollama') {
    body = {
      model,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    };
  } else {
    body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    };
  }

  return await window.api.spawnSubagent({
    url: endpoint,
    headers,
    body,
    format: cfg.format,
  });
}
