import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState, type ReactNode } from 'react';
import { factoryProfileSchema, type FactoryProfile } from '../factory-profile';
import { deleteFactory, updateFactoryProfile } from '../server/factory';
import { AppearanceGlyph } from './appearance-glyph';

const IconPickerFields = lazy(() =>
  import('./icon-picker-fields').then((module) => ({ default: module.IconPickerFields })),
);
const defaultIcon: FactoryProfile['icon'] = { kind: 'icon', name: 'factory', color: 'gray' };

export type FactoryProject = {
  id: string;
  title: string;
  workspaceRoot: string;
  icon?: FactoryProfile['icon'];
};

export function FactoryNavigationItem({
  project,
  children,
}: {
  project: FactoryProject;
  children: ReactNode;
}) {
  const id = useId();
  const editor = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const menu = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(project.title);
  const [icon, setIcon] = useState<FactoryProfile['icon']>(project.icon ?? defaultIcon);
  const [mode, setMode] = useState<'icon' | 'rename' | 'delete' | null>(null);
  const mutation = useMutation({
    mutationFn: () => updateFactoryProfile({ data: { id: project.id, profile: { title, icon } } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['agents'] });
      editor.current?.close();
    },
  });
  const deletion = useMutation({
    mutationFn: () => deleteFactory({ data: { id: project.id } }),
    onSuccess: async () => {
      editor.current?.close();
      await navigate({ to: '/app' });
      await client.invalidateQueries();
    },
  });
  function openEditor(next: 'icon' | 'rename' | 'delete') {
    menu.current?.hidePopover();
    setTitle(project.title);
    setIcon(project.icon ?? defaultIcon);
    mutation.reset();
    deletion.reset();
    setMode(next);
    editor.current?.showModal();
    if (next === 'rename') {
      input.current?.focus();
      input.current?.select();
    }
  }
  const pending = mutation.isPending || deletion.isPending;
  return (
    <div className="factory-nav-heading">
      <button
        type="button"
        className="factory-icon-trigger"
        aria-label={`Change icon for ${project.title}`}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => openEditor('icon')}
      >
        <AppearanceGlyph appearance={project.icon ?? defaultIcon} size={17} />
      </button>
      {children}
      <button
        type="button"
        className="factory-menu-trigger"
        aria-label={`Options for ${project.title}`}
        popoverTarget={`${id}-menu`}
      >
        <MoreHorizontal size={17} />
      </button>
      <div ref={menu} id={`${id}-menu`} className="factory-actions-menu" popover="auto">
        <button type="button" onClick={() => openEditor('rename')}>
          <Pencil size={15} /> Rename factory
        </button>
        <button type="button" className="destructive" onClick={() => openEditor('delete')}>
          <Trash2 size={15} /> Delete factory
        </button>
      </div>
      <dialog
        ref={editor}
        id={id}
        className="factory-editor"
        aria-label={`${mode === 'delete' ? 'Delete' : mode === 'icon' ? 'Change icon for' : 'Rename'} factory ${project.title}`}
        closedby="any"
        onClose={() => setMode(null)}
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'delete') {
              deletion.mutate();
            } else if (factoryProfileSchema.safeParse({ title, icon }).success) {
              mutation.mutate();
            }
          }}
        >
          <div className="factory-editor-heading">
            <strong>
              {mode === 'delete'
                ? 'Delete factory?'
                : mode === 'icon'
                  ? 'Change factory icon'
                  : 'Rename factory'}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Close factory editor"
              disabled={pending}
              onClick={() => editor.current?.close()}
            >
              <X size={16} />
            </button>
          </div>
          {mode === 'rename' && (
            <>
              <label htmlFor={`${id}-name`}>Name</label>
              <input
                ref={input}
                id={`${id}-name`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={80}
                disabled={pending}
              />
            </>
          )}
          {mode === 'icon' && (
            <div className="factory-icon-panel">
              <fieldset disabled={pending}>
                <legend className="sr-only">Factory icon</legend>
                <Suspense fallback={<p className="muted-copy">Loading icons…</p>}>
                  <IconPickerFields value={icon} name={title} onChange={setIcon} />
                </Suspense>
              </fieldset>
            </div>
          )}
          {mode === 'delete' && (
            <p>
              Delete “{project.title}” and its agents, teams, and run history? Project files on disk
              will be kept. This cannot be undone.
            </p>
          )}
          {deletion.isError && (
            <p className="factory-editor-error" role="alert">
              {deletion.error.message}
            </p>
          )}
          {mutation.isError && (
            <p className="factory-editor-error" role="alert">
              Could not save changes. Try again.
            </p>
          )}
          <div className="factory-editor-actions">
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => editor.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`button ${mode === 'delete' ? 'danger' : 'primary'}`}
              disabled={pending || !factoryProfileSchema.safeParse({ title, icon }).success}
            >
              {pending
                ? mode === 'delete'
                  ? 'Deleting…'
                  : 'Saving…'
                : mode === 'delete'
                  ? 'Delete factory'
                  : 'Save'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
