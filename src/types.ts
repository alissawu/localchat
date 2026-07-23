export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'kimi'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface Provider {
  id: string;
  type: ProviderType;
  name: string;
  key: string;
  endpoint?: string | null;
  model?: string | null;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: number;
  role: Role;
  content: string;
  tokens: number;
  archived?: boolean;
  isSummary?: boolean;
  isToolCall?: boolean;
  isToolResult?: boolean;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  streaming?: boolean;
  error?: boolean;
  summarizedCount?: number;
  createdAt?: number;
}

export interface Settings {
  providers: Provider[];
  activeProvider: string | null;
  autoArchive: boolean;
  strictMode: boolean;
  systemPrompt: string;
  reasoningEffort: 'default' | 'low' | 'high' | 'max';
}

export interface SubagentTask {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  startedAt: number;
}

export interface StoredData {
  conversations: Message[];
  archive: Message[];
}

declare global {
  interface Window {
    api: {
      loadData: () => Promise<StoredData | null>;
      saveData: (data: StoredData) => Promise<boolean>;
      wipeAll: () => Promise<boolean>;
      loadSettings: () => Promise<Partial<Settings> | null>;
      saveSettings: (settings: Settings) => Promise<boolean>;
      webSearch: (query: string) => Promise<string>;
      webFetch: (url: string) => Promise<string>;
      spawnSubagent: (req: {
        url: string;
        headers: Record<string, string>;
        body: Record<string, unknown>;
        format: 'openai' | 'anthropic' | 'ollama';
      }) => Promise<string>;
    };
  }
}
