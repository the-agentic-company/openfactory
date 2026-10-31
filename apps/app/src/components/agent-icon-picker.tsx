import { agentAppearanceSchema, type AgentAppearance } from '@openfactory/core';
import { X } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { AppearanceGlyph } from './appearance-glyph';

export { AppearanceGlyph as AgentGlyph } from './appearance-glyph';
const IconPickerFields = lazy(() =>
  import('./icon-picker-fields').then((module) => ({ default: module.IconPickerFields })),
);

export function AgentIconPicker({
  title,
  appearance,
  onSelect,
  pending,
}: {
  title: string;
  appearance?: AgentAppearance;
  onSelect: (value: AgentAppearance) => void;
  pending: boolean;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AgentAppearance>(
    appearance ?? { kind: 'icon', name: 'bot', color: 'gray' },
  );
  return (
    <>
      <button
        type="button"
        className="agent-glyph-button"
        aria-label={`Choose icon for ${title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        disabled={pending}
        onClick={() => {
          setDraft(appearance ?? { kind: 'icon', name: 'bot', color: 'gray' });
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <AppearanceGlyph appearance={appearance} />
      </button>
      <dialog
        id={id}
        ref={dialog}
        className="glyph-dialog identity-dialog"
        aria-label={`Icon picker for ${title}`}
        onClose={() => setOpen(false)}
        closedby="any"
      >
        <div className="glyph-header">
          <strong>Choose agent icon</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close icon picker"
            onClick={() => dialog.current?.close()}
          >
            <X size={16} />
          </button>
        </div>
        {open && (
          <Suspense fallback={<p className="muted-copy">Loading icons…</p>}>
            <IconPickerFields value={draft} name={title} onChange={setDraft} />
          </Suspense>
        )}
        <div className="factory-editor-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending || !agentAppearanceSchema.safeParse(draft).success}
            onClick={() => {
              onSelect(draft);
              dialog.current?.close();
            }}
          >
            Save icon
          </button>
        </div>
      </dialog>
    </>
  );
}
