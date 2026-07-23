import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, Settings, StoredData, SubagentTask } from '../types';

const DEFAULT_SETTINGS: Settings = {
  providers: [],
  activeProvider: null,
  autoArchive: true,
  strictMode: true,
  reasoningEffort: 'max',
  systemPrompt:
    "You are a legal research assistant. When stating facts, case law, or precedents, cite your sources. If you're uncertain about something, say so clearly. Do not make up case names, statutes, or quotes. When you need current information, use the web_search tool. When you need to read a specific page, use the web_fetch tool.",
};

export function useAppState() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [archive, setArchive] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [subagents, setSubagents] = useState<SubagentTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Refs to always-current values for stable callbacks
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Debounced persistence
  const saveTimer = useRef<number | null>(null);
  const settingsTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [data, saved] = await Promise.all([
        window.api.loadData(),
        window.api.loadSettings(),
      ]);
      if (cancelled) return;
      if (data) {
        setMessages(data.conversations || []);
        setArchive(data.archive || []);
      }
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const data: StoredData = { conversations: messages, archive };
      window.api.saveData(data);
    }, 250);
  }, [messages, archive, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (settingsTimer.current) window.clearTimeout(settingsTimer.current);
    settingsTimer.current = window.setTimeout(() => {
      window.api.saveSettings(settings);
    }, 200);
  }, [settings, loaded]);

  const wipe = useCallback(async () => {
    await window.api.wipeAll();
    setMessages([]);
    setArchive([]);
    setSettings({ ...DEFAULT_SETTINGS, systemPrompt: settingsRef.current.systemPrompt });
    setSubagents([]);
  }, []);

  return {
    messages,
    setMessages,
    messagesRef,
    archive,
    setArchive,
    settings,
    setSettings,
    settingsRef,
    subagents,
    setSubagents,
    loaded,
    wipe,
  };
}
