import type { ReactNode } from 'react';
import { Select, SelectItem } from './ui/select';
import { projectName } from '../project-path';
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
import { WorkspacePage } from './workspace-page';
import type { FactoryProject } from './factory-navigation-item';
import { AppearanceGlyph } from './appearance-glyph';
import { Modal } from './modal';
import '../factory-definition.css';

const CodeEditor = lazy(() => import('./factory-code-editor'));
type Project = FactoryProject;
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
      <WorkspacePage title="Factory definition">
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
          {!projects.length && <p>Start the OpenFactory runtime to load your factories.</p>}
        </section>
      </WorkspacePage>
    );
  }
  return (
    <>
      <FactoryEditor
        key={project.id}
        project={project}
        navigation={
          <header className="definition-mobile-navigation">
            <Link
              to="/app/projects/$project/$view"
              params={{ project: projectName(project.workspaceRoot), view: 'agents' }}
            >
              Back to agents
            </Link>
            <label htmlFor="factory-definition-select-1">
              Factory
              <Select
                id="factory-definition-select-1"
                value={project.workspaceRoot}
                onValueChange={(value) => onSelectProject(value)}
              >
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.workspaceRoot}>
                    {item.title}
                  </SelectItem>
                ))}
              </Select>
            </label>
          </header>
        }
      />
    </>
  );
}

function FactoryEditor({ project, navigation }: { project: Project; navigation: ReactNode }) {
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
      setNotice(result.applied ? 'File saved and applied.' : 'File saved.');
      void client.invalidateQueries({ queryKey: ['factory-definition', project.id] });
      void client.invalidateQueries({ queryKey: ['agents'] });
      void client.invalidateQueries({ queryKey: ['factory-teams', project.id] });
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
    <WorkspacePage
      layout="fill"
      contentClassName="factory-definition-workspace"
      project={project}
      title="Factory definition"
      actions={
        query.data ? (
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
        ) : undefined
      }
    >
      {navigation}
      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error.message} <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      {query.isPending && <p className="definition-loading">Loading factory files…</p>}
      {query.data && (
        <>
          <div className="factory-code-layout">
            <label htmlFor="factory-definition-select-2" className="definition-mobile-file-picker">
              File
              <Select
                id="factory-definition-select-2"
                value={path}
                onValueChange={(value) => {
                  setPath(value);
                  setNotice('');
                  save.reset();
                }}
              >
                {query.data.files.map((item) => (
                  <SelectItem key={item.path} value={item.path}>
                    {item.path}
                  </SelectItem>
                ))}
              </Select>
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
                <AppearanceGlyph
                  appearance={project.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }}
                  size={15}
                />
                <strong>{project.title}</strong>
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
                  {path === 'factory.yaml'
                    ? 'Configuration'
                    : path.startsWith('teams/')
                      ? 'Team'
                      : 'Live agent'}
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
    </WorkspacePage>
  );
}
