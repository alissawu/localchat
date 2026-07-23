import { useEffect } from 'react';
import clsx from 'clsx';

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'rise w-full overflow-hidden rounded-lg border border-hairline bg-slate shadow-2xl',
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="font-serif text-[18px] italic text-parchment">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-[18px] text-dust hover:text-parchment"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-hairline bg-graphite/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
