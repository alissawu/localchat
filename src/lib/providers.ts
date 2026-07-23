import type { Provider, ProviderType } from '../types';

export interface ProviderConfig {
  endpoint: string;
  defaultModel: string;
  authHeader: (key: string) => Record<string, string>;
  supportsTools: boolean;
  // Anthropic-style: uses different request/response shape
  format: 'openai' | 'anthropic' | 'ollama';
}

export const providerConfigs: Record<ProviderType, ProviderConfig> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    supportsTools: true,
    format: 'openai',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    authHeader: (k) => ({
      'x-api-key': k,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    supportsTools: true,
    format: 'anthropic',
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    supportsTools: true,
    format: 'openai',
  },
  kimi: {
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    defaultModel: 'kimi-k3',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    supportsTools: true,
    format: 'openai',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'moonshotai/kimi-k3',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    supportsTools: true,
    format: 'openai',
  },
  ollama: {
    endpoint: 'http://localhost:11434/api/chat',
    defaultModel: 'llama3.3',
    authHeader: () => ({}),
    supportsTools: false,
    format: 'ollama',
  },
  custom: {
    endpoint: '',
    defaultModel: '',
    authHeader: (k) => (k ? { Authorization: `Bearer ${k}` } : {} as Record<string, string>),
    supportsTools: true,
    format: 'openai',
  },
};

export function resolveProvider(p: Provider): {
  cfg: ProviderConfig;
  endpoint: string;
  model: string;
} {
  const cfg = providerConfigs[p.type] || providerConfigs.custom;
  return {
    cfg,
    endpoint: p.endpoint || cfg.endpoint,
    model: p.model || cfg.defaultModel,
  };
}

export const openaiTools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information. Use this for case law, statutes, news, or any factual claims you need to verify.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Fetch and read the contents of a web page. Use this to read full articles, legal documents, or case details.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The URL to fetch' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        'Spawn a focused subagent to handle a specific task in isolation. Use for research, analysis, drafting, or anything that benefits from a dedicated pass without your full chat history. The subagent sees ONLY the prompt you give it and has no tools of its own — put everything it needs in the prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed self-contained prompt for the subagent, including all context and instructions.',
          },
        },
        required: ['prompt'],
      },
    },
  },
] as const;

export const anthropicTools = [
  {
    name: 'web_search',
    description:
      'Search the web for current information. Use this for case law, statutes, news, or any factual claims you need to verify.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query' } },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch and read the contents of a web page. Use this to read full articles, legal documents, or case details.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The URL to fetch' } },
      required: ['url'],
    },
  },
  {
    name: 'spawn_subagent',
    description:
      'Spawn a focused subagent to handle a specific task in isolation. Use for research, analysis, drafting, or anything that benefits from a dedicated pass without your full chat history. The subagent sees ONLY the prompt you give it and has no tools of its own — put everything it needs in the prompt.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed self-contained prompt for the subagent, including all context and instructions.',
        },
      },
      required: ['prompt'],
    },
  },
] as const;
