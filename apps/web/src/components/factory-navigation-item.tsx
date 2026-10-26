import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { WorkspaceView } from '@openfactory/core';
import { MoreHorizontal, X } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { factoryProfileSchema, type FactoryProfile } from '../factory-profile';
import { updateFactoryProfile } from '../server/factory';
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
  active,
  view,
  count,
  compact = false,
}: {
  project: FactoryProject;
  active: boolean;
  view: WorkspaceView;
  count: number;
  compact?: boolean;
}) {
  const id = useId();
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const [title, setTitle] = useState(project.title);
  const [icon, setIcon] = useState<FactoryProfile['icon']>(project.icon ?? defaultIcon);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const mutation = useMutation({
    mutationFn: () => updateFactoryProfile({ data: { id: project.id, profile: { title, icon } } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['agents'] });
      editor.current?.hidePopover();
    },
  });
  return (
    <div className={`factory-nav-item ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}>
      {!compact && (
        <Link
          className="nav-link"
          to="/"
          search={{ project: project.workspaceRoot, view }}
          title={project.workspaceRoot}
          aria-current={active ? 'page' : undefined}
        >
          <AppearanceGlyph appearance={project.icon ?? defaultIcon} size={17} />
          <span className="factory-name">{project.title}</span>
          <span className="nav-count">{count}</span>
        </Link>
      )}
      <button
        type="button"
        className="factory-menu-trigger"
        aria-label={`Edit factory ${project.title}`}
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 460)),
            top: Math.max(12, Math.min(rect.top, window.innerHeight - 600)),
          });
          setTitle(project.title);
          setIcon(project.icon ?? defaultIcon);
          mutation.reset();
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      <div
        ref={editor}
        id={id}
        popover="auto"
        className="factory-editor"
        style={position}
        onToggle={(event) => {
          setOpen(event.newState === 'open');
          if (event.newState === 'open') {
            input.current?.focus();
            input.current?.select();
          }
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (factoryProfileSchema.safeParse({ title, icon }).success) {
              mutation.mutate();
            }
          }}
        >
          <div className="factory-editor-heading">
            <strong>Edit factory</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Close factory editor"
              popoverTarget={id}
              popoverTargetAction="hide"
            >
              <X size={16} />
            </button>
          </div>
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            ref={input}
            id={`${id}-name`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={80}
            disabled={mutation.isPending}
          />
          <div className="factory-icon-panel">
            <fieldset disabled={mutation.isPending}>
              <legend className="sr-only">Factory icon</legend>
              {open && (
                <Suspense fallback={<p className="muted-copy">Loading icons…</p>}>
                  <IconPickerFields value={icon} name={title} onChange={setIcon} />
                </Suspense>
              )}
            </fieldset>
          </div>
          {mutation.isError && (
            <p className="factory-editor-error" role="alert">
              Could not save changes. Try again.
            </p>
          )}
          <div className="factory-editor-actions">
            <button
              type="button"
              className="button secondary"
              popoverTarget={id}
              popoverTargetAction="hide"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                mutation.isPending || !factoryProfileSchema.safeParse({ title, icon }).success
              }
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
