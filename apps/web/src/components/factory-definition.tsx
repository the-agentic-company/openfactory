import { validateFactoryFile } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker } from '@tanstack/react-router';
import {
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { getFactoryDefinition, saveFactoryDefinitionFile } from '../server/factory-definition';
import { Modal } from './modal';
import '../factory-definition.css';

const CodeEditor = lazy(() => import('./factory-code-editor'));
type Project = { id: string; title: string; workspaceRoot: string };
type Draft = { source: string; revision: string; expectedRuntime: string | null };

function FileTree({
  paths,
  selected,
  dirty,
  onSelect,
  prefix = '',
}: {
  paths: string[];
  selected: string;
  dirty: string[];
  onSelect: (path: string) => void;
  prefix?: string;
}) {
  const entries = [...new Set(paths.map((path) => path.slice(prefix.length).split('/')[0]!))];
  return (
    <ul className="definition-tree-list">
      {entries.map((name) => {
        const path = `${prefix}${name}`;
        const directory = paths.some((item) => item.startsWith(`${path}/`));
        return (
          <li key={path}>
            {directory ? (
              <details open>
                <summary title={name}>
                  <ChevronRight size={12} />
                  <Folder size={14} />
                  <span>{name}</span>
                </summary>
                <FileTree
                  paths={paths.filter((item) => item.startsWith(`${path}/`))}
                  prefix={`${path}/`}
                  selected={selected}
                  dirty={dirty}
                  onSelect={onSelect}
                />
              </details>
            ) : (
              <button
                className={selected === path ? 'selected' : ''}
                aria-current={selected === path ? 'page' : undefined}
                title={path}
                onClick={() => onSelect(path)}
              >
                {path.endsWith('.yaml') ? <FileCode2 size={14} /> : <FileText size={14} />}
                <span>{name}</span>
                {dirty.includes(path) && <i aria-label="Unsaved changes" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FactoryDefinition({
  project,
  projects,
  onSelectProject,
}: {
  project?: Project;
  projects: Project[];
  onSelectProject: (path: string) => void;
}) {
  if (!project) {
    return (
      <section className="definition-choose-factory">
        <FolderOpen size={28} />
        <h2>Select a factory</h2>
        <p>Open its configuration and agent files.</p>
        <div>
          {projects.map((item) => (
            <button
              className="button secondary"
              key={item.id}
              onClick={() => onSelectProject(item.workspaceRoot)}
            >
              <Folder size={15} />
              {item.title}
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        {!projects.length && <p>Connect to T3 Code to load your factories.</p>}
      </section>
    );
  }
  return (
    <>
      <header className="definition-mobile-navigation">
        <Link to="/" search={{ project: project.workspaceRoot, view: 'agents' }}>
          Back to agents
        </Link>
        <label>
          Factory
          <select
            value={project.workspaceRoot}
            onChange={(event) => onSelectProject(event.target.value)}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.workspaceRoot}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <FactoryEditor key={project.id} project={project} />
    </>
  );
}

function FactoryEditor({ project }: { project: Project }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['factory-definition', project.id],
    queryFn: () => getFactoryDefinition({ data: { projectId: project.id } }),
    refetchOnWindowFocus: false,
  });
  const [path, setPath] = useState('factory.yaml');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState('');
  const dirty = Object.keys(drafts);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.length > 0,
    enableBeforeUnload: dirty.length > 0,
    withResolver: true,
  });
  const file = query.data?.files.find((item) => item.path === path);
  const source = drafts[path]?.source ?? file?.source ?? '';
  let validation = '';
  if (file) {
    try {
      validateFactoryFile(path, source);
    } catch (error) {
      validation = error instanceof Error ? error.message : 'Invalid definition.';
    }
  }
  const save = useMutation({
    mutationFn: (data: Parameters<typeof saveFactoryDefinitionFile>[0]['data']) =>
      saveFactoryDefinitionFile({ data }),
    onSuccess: (result, variables) => {
      setDrafts((previous) =>
        Object.fromEntries(
          Object.entries(previous)
            .filter(([name]) => name !== variables.path)
            .map(([name, draft]) => [name, { ...draft, revision: result.revision }]),
        ),
      );
      setNotice(
        result.applied
          ? 'Agent file saved and applied to T3.'
          : 'factory.yaml saved. Shared execution defaults are stored only.',
      );
      void client.invalidateQueries({ queryKey: ['factory-definition', project.id] });
      void client.invalidateQueries({ queryKey: ['agents'] });
    },
  });
  function edit(value: string) {
    if (!file || !query.data) {
      return;
    }
    const revision = query.data.revision;
    setNotice('');
    setDrafts((previous) => {
      const next = { ...previous };
      if (value === file.source) {
        delete next[path];
      } else {
        next[path] = {
          source: value,
          revision: previous[path]?.revision ?? revision,
          expectedRuntime: previous[path]?.expectedRuntime ?? file.liveSource,
        };
      }
      return next;
    });
  }
  const paths =
    query.data?.files
      .map((item) => item.path)
      .filter((name) => name.toLowerCase().includes(search.toLowerCase())) ?? [];
  return (
    <section className="factory-definition-workspace" aria-label="Factory code">
      <h1 className="sr-only">Factory definition</h1>
      <div className="factory-code-notice">
        <FileCode2 size={20} />
        <div>
          <strong>Your factory is defined in code</strong>
          <p>
            Configuration and agent instructions, saved as YAML and Markdown.{' '}
            <Link to="/docs/$" params={{ _splat: '' }}>
              Syntax reference
            </Link>
          </p>
        </div>
      </div>
      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error.message} <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      {query.isPending && <p className="definition-loading">Loading factory files…</p>}
      {query.data && (
        <>
          <div className="factory-code-toolbar">
            <span className="definition-file-count">
              {query.data.files.length} files
              {dirty.length ? ` · ${dirty.length} unsaved` : ' · All changes saved'}
            </span>
            <div className="definition-actions">
              <button
                className="button secondary"
                disabled={save.isPending || query.isFetching || dirty.length > 0}
                onClick={() => void query.refetch()}
              >
                <RefreshCw size={14} />
                Reload files
              </button>
              <button
                className="button primary"
                disabled={
                  !drafts[path] ||
                  Boolean(validation) ||
                  save.isPending ||
                  Boolean(file?.agentId && !file.liveSource)
                }
                onClick={() => {
                  const draft = drafts[path];
                  if (draft) {
                    save.mutate({ projectId: project.id, path, ...draft });
                  }
                }}
              >
                <Save size={14} />
                {save.isPending ? 'Saving…' : 'Save file'}
              </button>
            </div>
          </div>
          <div className="factory-code-layout">
            <label className="definition-mobile-file-picker">
              File
              <select
                value={path}
                onChange={(event) => {
                  setPath(event.target.value);
                  setNotice('');
                  save.reset();
                }}
              >
                {query.data.files.map((item) => (
                  <option key={item.path} value={item.path}>
                    {item.path}
                  </option>
                ))}
              </select>
            </label>
            <aside className="definition-file-tree" aria-label="Factory files">
              <label className="definition-file-search">
                <Search size={14} />
                <input
                  aria-label="Search factory files"
                  placeholder="Search files…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="definition-tree-root">
                <FolderOpen size={15} />
                <strong>Factory definition</strong>
              </div>
              <FileTree
                paths={paths}
                selected={path}
                dirty={dirty}
                onSelect={(name) => {
                  setPath(name);
                  setNotice('');
                  save.reset();
                }}
              />
              {!paths.length && <p className="definition-no-files">No matching files.</p>}
            </aside>
            <div className="definition-editor-pane">
              <div className="definition-file-tab">
                <FileCode2 size={14} />
                <code title={path}>{path}</code>
                {drafts[path] && (
                  <span className="definition-dirty-dot" aria-label="Unsaved changes" />
                )}
                <span className="definition-file-kind">
                  {path === 'factory.yaml' ? 'Configuration' : 'Live agent'}
                </span>
              </div>
              <div className="factory-code-editor">
                <Suspense fallback={<pre className="definition-editor-fallback">{source}</pre>}>
                  <CodeEditor
                    path={path}
                    source={source}
                    disabled={save.isPending || Boolean(file?.agentId && !file.liveSource)}
                    onChange={edit}
                  />
                </Suspense>
              </div>
              <div className="definition-editor-status">
                <span>
                  {path.endsWith('.yaml') ? 'YAML' : 'Markdown + YAML'} ·{' '}
                  {source.split('\n').length} lines
                </span>
                <span>UTF-8</span>
              </div>
            </div>
          </div>
          {validation && (
            <pre role="alert" className="error-banner definition-validation">
              {validation}
            </pre>
          )}
          {save.isError && (
            <p role="alert" className="error-banner">
              {save.error.message}
            </p>
          )}
          {notice && <output className="definition-save-notice">{notice}</output>}
          <div className="definition-save-context">
            <p>
              {path === 'factory.yaml'
                ? 'Save stores this factory configuration on the host. Shared defaults are not applied to running agents.'
                : file?.liveSource
                  ? 'Save applies this agent’s name, instructions, and model to T3. Its trigger and permissions stay unchanged.'
                  : 'This agent is no longer in T3. Its saved file is read-only.'}
            </p>
            <div className="definition-actions">
              {file?.liveSource && (
                <button
                  className="button secondary"
                  disabled={save.isPending}
                  onClick={() => edit(file.liveSource!)}
                >
                  Load from T3
                </button>
              )}
              {drafts[path] && (
                <button
                  className="button secondary"
                  disabled={save.isPending}
                  onClick={() => edit(file?.source ?? '')}
                >
                  Discard file changes
                </button>
              )}
            </div>
          </div>
          <details className="definition-storage">
            <summary>Saved files on this host</summary>
            <code>{query.data.location}</code>
          </details>
        </>
      )}
      {blocker.status === 'blocked' && (
        <Modal titleId="leave-definition-title" onClose={() => blocker.reset()}>
          <h2 id="leave-definition-title">Leave without saving?</h2>
          <p>Your unsaved file edits will be discarded.</p>
          <div className="definition-actions">
            <button className="button secondary" onClick={() => blocker.reset()}>
              Keep editing
            </button>
            <button className="button primary" onClick={() => blocker.proceed()}>
              Discard and leave
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
