import { useState } from 'react';
import type { Provider, ProviderType, Settings } from '../types';
import Modal from './Modal';

const TYPE_LABELS: Record<ProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  kimi: 'Kimi (Moonshot AI)',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (local)',
  custom: 'Custom OpenAI-compatible',
};

export default function SettingsModal({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{
    type: ProviderType;
    name: string;
    key: string;
    endpoint: string;
    model: string;
  }>({ type: 'openai', name: '', key: '', endpoint: '', model: '' });

  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const saveProvider = () => {
    if (!form.key && form.type !== 'ollama') {
      alert('API key required');
      return;
    }
    const provider: Provider = {
      id: String(Date.now()),
      type: form.type,
      name: form.name || TYPE_LABELS[form.type],
      key: form.key,
      endpoint: form.endpoint || null,
      model: form.model || null,
    };
    patch({ providers: [...settings.providers, provider] });
    setAdding(false);
    setForm({ type: 'openai', name: '', key: '', endpoint: '', model: '' });
  };

  const removeProvider = (id: string) => {
    patch({
      providers: settings.providers.filter((p) => p.id !== id),
      activeProvider: settings.activeProvider === id ? null : settings.activeProvider,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" size="lg">
      <Section title="API Providers">
        <div className="space-y-2">
          {settings.providers.length === 0 && (
            <div className="rounded-sm border border-dashed border-hairline px-4 py-6 text-center font-serif text-[13px] italic text-dust">
              no providers configured yet.
            </div>
          )}
          {settings.providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-sm border border-hairline bg-graphite/60 px-3 py-2"
            >
              <div>
                <div className="text-[14px] text-parchment">{p.name}</div>
                <div className="font-mono text-[11px] text-dust">
                  {p.type} · {p.model || 'default model'}
                </div>
              </div>
              <button
                onClick={() => removeProvider(p.id)}
                className="font-mono text-[11px] uppercase tracking-wider text-crimson hover:underline"
              >
                remove
              </button>
            </div>
          ))}
        </div>

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="mt-3 rounded-sm border border-hairline bg-graphite px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-parchment hover:border-amber/50 hover:text-amber"
          >
            + Add provider
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded-sm border border-hairline bg-graphite/60 p-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ProviderType })}
                className="input"
              >
                {(Object.keys(TYPE_LABELS) as ProviderType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Display name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={TYPE_LABELS[form.type]}
                className="input"
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                className="input"
                placeholder="sk-…"
              />
            </Field>
            <Field label="Endpoint (optional)">
              <input
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                className="input"
                placeholder="https://…/v1/chat/completions"
              />
            </Field>
            <Field label="Model (optional)">
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="input"
                placeholder="kimi-k3 · gpt-4o · claude-sonnet-4-…"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAdding(false)}
                className="rounded-sm border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ash hover:text-parchment"
              >
                Cancel
              </button>
              <button
                onClick={saveProvider}
                className="rounded-sm bg-amber px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink hover:bg-amber-2"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Grounding & Tools">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-parchment">
          <input
            type="checkbox"
            checked={settings.strictMode}
            onChange={(e) => patch({ strictMode: e.target.checked })}
            className="accent-amber"
          />
          Strict mode (enable web search tools + grounding prompt)
        </label>
        <div className="mt-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-dust">
            System prompt
          </div>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => patch({ systemPrompt: e.target.value })}
            rows={5}
            className="input font-mono text-[12px]"
          />
        </div>
      </Section>

      <Section title="Archive">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-parchment">
          <input
            type="checkbox"
            checked={settings.autoArchive}
            onChange={(e) => patch({ autoArchive: e.target.checked })}
            className="accent-amber"
          />
          Keep originals when summarizing
        </label>
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-dust">{label}</div>
      {children}
    </div>
  );
}
