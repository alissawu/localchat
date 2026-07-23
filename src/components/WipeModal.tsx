import Modal from './Modal';

export default function WipeModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Wipe all data"
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-sm border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ash hover:text-parchment"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-sm border border-crimson bg-crimson/20 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-crimson hover:bg-crimson/30"
          >
            Wipe everything
          </button>
        </>
      }
    >
      <p className="font-serif text-[14px] leading-relaxed text-parchment">
        This overwrites and deletes every conversation, archive, and provider setting on disk.
      </p>
      <p className="mt-2 font-serif text-[14px] italic text-crimson">
        Cannot be undone.
      </p>
    </Modal>
  );
}
