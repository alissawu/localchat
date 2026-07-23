import { useCallback, useMemo, useRef, useState } from 'react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import SummarizeModal from './components/SummarizeModal';
import WipeModal from './components/WipeModal';
import { useAppState } from './hooks/useAppState';
import { useChat } from './hooks/useChat';
import { generateSummary } from './lib/summarize';
import { estimateTokens } from './lib/stream';
import type { Message } from './types';

let idSeq = Date.now() + 1;
const nextId = () => ++idSeq;

export default function App() {
  const state = useAppState();
  const {
    messages,
    setMessages,
    messagesRef,
    archive,
    setArchive,
    settings,
    setSettings,
    settingsRef,
    subagents,
    wipe,
    loaded,
  } = state;

  const chat = useChat({ messagesRef, setMessages, settingsRef });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryTargetsRef = useRef<Message[]>([]);

  const activeProvider = useMemo(
    () => settings.providers.find((p) => p.id === settings.activeProvider) || null,
    [settings.providers, settings.activeProvider],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deleteMessage = useCallback(
    (id: number) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    [setMessages],
  );

  const scrollTo = useCallback((_id: number) => {
    // Chat handles auto-scroll; deep-linking to a specific message can be a future enhancement.
  }, []);

  const send = useCallback(
    async (text: string) => {
      try {
        await chat.send(text);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [chat],
  );

  const summarize = useCallback(
    async (mode: 'all' | 'selected') => {
      if (!activeProvider) {
        alert('Select a provider first');
        return;
      }
      let targets: Message[];
      if (mode === 'all') {
        targets = messages.filter(
          (m) => !m.isSummary && !m.archived && !m.isToolCall && !m.isToolResult,
        );
      } else {
        targets = messages.filter((m) => selectedIds.has(m.id));
      }
      if (targets.length < 2) {
        alert('Need at least 2 messages to summarize');
        return;
      }
      summaryTargetsRef.current = targets;
      setSummaryText('');
      setSummaryLoading(true);
      setSummarizeOpen(true);
      try {
        const text = await generateSummary(activeProvider, targets);
        setSummaryText(text);
      } catch (e) {
        setSummaryText(`⚠ ${(e as Error).message}`);
      } finally {
        setSummaryLoading(false);
      }
    },
    [activeProvider, messages, selectedIds],
  );

  const applySummary = useCallback(
    (text: string, keepOriginals: boolean) => {
      const targets = summaryTargetsRef.current;
      const ids = new Set(targets.map((m) => m.id));
      const firstIdx = messages.findIndex((m) => ids.has(m.id));
      if (keepOriginals) {
        setArchive((prev) => [...prev, ...targets.map((m) => ({ ...m, archivedAt: Date.now() }))]);
      }
      const summaryMsg: Message = {
        id: nextId(),
        role: 'system',
        content: text,
        tokens: estimateTokens(text),
        isSummary: true,
        summarizedCount: targets.length,
        createdAt: Date.now(),
      };
      setMessages((prev) => {
        const filtered = prev.filter((m) => !ids.has(m.id));
        filtered.splice(Math.max(firstIdx, 0), 0, summaryMsg);
        return filtered;
      });
      setSelectedIds(new Set());
      setSummarizeOpen(false);
    },
    [messages, setArchive, setMessages],
  );

  const newChat = useCallback(() => {
    if (messages.length === 0) return;
    if (confirm('Start a new conversation? Current messages will be cleared.')) {
      setMessages([]);
      setSelectedIds(new Set());
    }
  }, [messages.length, setMessages]);

  if (!loaded) {
    return (
      <div className="grain flex h-full items-center justify-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-dust">
          decrypting…
        </div>
      </div>
    );
  }

  return (
    <div className="grain flex h-full">
      <Sidebar
        messages={messages}
        selectedIds={selectedIds}
        onScrollTo={scrollTo}
        onSummarizeAll={() => summarize('all')}
        onSummarizeSelected={() => summarize('selected')}
        onNewChat={newChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWipe={() => setWipeOpen(true)}
        providers={settings.providers}
        activeProviderId={settings.activeProvider}
        onSelectProvider={(id) => setSettings({ ...settings, activeProvider: id })}
        subagents={subagents}
      />
      <Chat
        messages={messages}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onDelete={deleteMessage}
        onSend={send}
        onStop={chat.stop}
        streaming={chat.streaming}
        toolStatus={chat.toolStatus}
        hasProvider={!!activeProvider}
        reasoningEffort={settings.reasoningEffort}
        onReasoningChange={(v) => setSettings({ ...settings, reasoningEffort: v })}
        providerName={activeProvider ? `${activeProvider.name}` : null}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
      />
      <SummarizeModal
        open={summarizeOpen}
        onClose={() => setSummarizeOpen(false)}
        initialText={summaryText}
        count={summaryTargetsRef.current.length}
        defaultKeepOriginals={settings.autoArchive}
        onApply={applySummary}
        loading={summaryLoading}
      />
      <WipeModal
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={async () => {
          await wipe();
          setSelectedIds(new Set());
          setWipeOpen(false);
        }}
      />
    </div>
  );
}
