import { useState, useEffect } from 'react';
import Modal from './Modal';

export default function SummarizeModal({
  open,
  onClose,
  initialText,
  count,
  defaultKeepOriginals,
  onApply,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  initialText: string;
  count: number;
  defaultKeepOriginals: boolean;
  onApply: (text: string, keepOriginals: boolean) => void;
  loading: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [keep, setKeep] = useState(defaultKeepOriginals);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review summary"
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-sm border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ash hover:text-parchment"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(text, keep)}
            className="rounded-sm bg-amber px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink hover:bg-amber-2"
          >
            Apply summary
          </button>
        </>
      }
    >
      <p className="mb-3 font-serif text-[13px] italic text-ash">
        {loading
          ? 'Generating…'
          : `The next ${count} messages will be replaced with this summary.`}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        disabled={loading}
        className="input font-serif text-[14px] leading-relaxed"
      />
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-parchment">
        <input
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep(e.target.checked)}
          className="accent-amber"
        />
        Archive original messages
      </label>
    </Modal>
  );
}
