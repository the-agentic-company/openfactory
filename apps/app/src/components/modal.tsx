import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  titleId,
  onClose,
  children,
  wide = false,
  className = '',
}: {
  wide?: boolean;
  className?: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`detail-panel ${wide ? 'wide-panel' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
