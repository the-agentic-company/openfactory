import { type MarketplaceKind, type MarketplaceEntry } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowUpRight, Check, Copy, Search, Star, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getAgents } from '../server/agents';
import {
  addMarketplaceEntry,
  getImportTarget,
  getMarketplace,
  showMarketplaceSource,
} from '../server/marketplace';
import { WorkspacePage } from './workspace-page';
import { WorkspaceSidebar } from './workspace-sidebar';
import { Modal } from './modal';
import './marketplace.css';

const kinds = [
  { kind: 'factory', label: 'Factories' },
  { kind: 'agent', label: 'Agents' },
  { kind: 'automation', label: 'Automations' },
  { kind: 'team', label: 'Teams' },
] satisfies { kind: MarketplaceKind; label: string }[];
type Workspace = Awaited<ReturnType<typeof getAgents>>;

export function Marketplace({ kind, workspace }: { kind: MarketplaceKind; workspace: Workspace }) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<MarketplaceEntry | null>(null);
  const listing = useQuery({
    queryKey: ['marketplace', kind, query],
    queryFn: () => getMarketplace({ data: { kind, query } }),
    staleTime: 60000,
    retry: false,
  });
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (/^[\w.-]+\/[\w.-]+(?:@[a-f0-9]{40})?$/.test(value)) {
      setSource({
        source: value,
        kind,
        name: 'factory',
        title: value,
        description: '',
        stars: null,
        url: null,
      });
    } else {
      setQuery(value);
    }
  }
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={workspace.agents}
        projects={workspace.projects}
        activeView="marketplace"
      />
      <div className="main-shell">
        <WorkspacePage title="Marketplace" contentClassName="marketplace">
          <header className="marketplace-intro">
            <h2>Good work is worth sharing.</h2>
            <p>
              Discover factories, agents, and automations. Inspect their definitions, then make them
              yours.
            </p>
          </header>
          <div className="marketplace-terminal">
            <span aria-hidden="true">$</span>
            <code>openfactory factory add owner/repo --project &lt;project-id&gt;</code>
          </div>
          <nav className="marketplace-types" aria-label="Import types">
            {kinds.map((item) => (
              <Link
                key={item.kind}
                to="/app/marketplace/{-$type}"
                params={{ type: item.kind }}
                className={kind === item.kind ? 'selected' : ''}
                aria-current={kind === item.kind ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form className="marketplace-search" onSubmit={search}>
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Search marketplace or open GitHub repository"
              value={draft}
              maxLength={120}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Search ${kinds.find((item) => item.kind === kind)?.label.toLowerCase()} or enter owner/repo…`}
            />
            <button className="button" type="submit">
              Search
            </button>
          </form>
          <div className="marketplace-list-heading">
            <h3>Leaderboard</h3>
            <span>GitHub stars · bundled starters below</span>
          </div>
          <p className="marketplace-guidance">
            Publish a public repository with a <code>factory/</code> directory and the{' '}
            <code>openfactory-{kind}</code> topic to appear here.
          </p>
          {listing.isPending && <output>Loading marketplace…</output>}
          {listing.error && (
            <div role="alert">
              <p>{listing.error.message}</p>
              <button className="button" onClick={() => void listing.refetch()}>
                Try again
              </button>
            </div>
          )}
          {listing.data?.warning && (
            <output className="marketplace-warning">{listing.data.warning}</output>
          )}
          {listing.data?.entries.length === 0 && (
            <div className="empty-state">
              <h3>No matches yet</h3>
              <p>Try a different search or open a GitHub owner/repo directly.</p>
            </div>
          )}
          <ol className="marketplace-list">
            {listing.data?.entries.map((entry, index) => (
              <li key={`${entry.source}:${entry.kind}:${entry.name}`}>
                <button className="marketplace-row" onClick={() => setSource(entry)}>
                  <span className="marketplace-rank">{index + 1}</span>
                  <span className="marketplace-summary">
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.source}
                      {entry.name !== 'factory' ? ` / ${entry.name}` : ''}
                    </small>
                    <span>{entry.description}</span>
                  </span>
                  <span className="marketplace-stars">
                    {entry.stars === null ? (
                      'Starter'
                    ) : (
                      <>
                        <Star size={14} aria-hidden="true" /> {entry.stars.toLocaleString()}
                      </>
                    )}
                  </span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <footer className="marketplace-footer">
            Definitions live in GitHub. Imports are local copies you can edit. Imported agents start
            paused.
          </footer>
        </WorkspacePage>
      </div>
      {source && (
        <MarketplaceDetail
          key={`${source.source}:${kind}`}
          entry={source}
          kind={kind}
          workspace={workspace}
          onClose={() => setSource(null)}
        />
      )}
    </div>
  );
}

function MarketplaceDetail({
  entry,
  kind,
  workspace,
  onClose,
}: {
  entry: MarketplaceEntry;
  kind: MarketplaceKind;
  workspace: Workspace;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const preview = useQuery({
    queryKey: ['marketplace-source', entry.source],
    queryFn: () => showMarketplaceSource({ data: { source: entry.source } }),
    staleTime: 60000,
    retry: false,
  });
  const [selectedName, setSelectedName] = useState(entry.name);
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id ?? '');
  const [path, setPath] = useState('factory.yaml');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const entries = preview.data?.entries.filter((item) => item.kind === kind) ?? [];
  const selected = entries.find((item) => item.name === selectedName) ?? entries[0];
  const target = useQuery({
    queryKey: ['marketplace-target', projectId],
    queryFn: () => getImportTarget({ data: { projectId } }),
    enabled: Boolean(projectId),
    staleTime: 0,
    retry: false,
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!preview.data || !selected || !target.data) {
        throw new Error('Load the source and target factory before importing.');
      }
      return addMarketplaceEntry({
        data: {
          source: preview.data.source,
          kind,
          name: selected.name,
          projectId,
          revision: target.data,
          previewRevision: preview.data.revision,
        },
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agents'] });
      void client.invalidateQueries({ queryKey: ['marketplace-target', projectId] });
    },
  });
  const command = `openfactory factory add ${preview.data?.source ?? entry.source} --type ${kind}${kind === 'factory' ? '' : ` --name ${selected?.name ?? '<name>'}`} --project ${"'" + (projectId || '<project-id>').replaceAll("'", "'\\''") + "'"}`;
  return (
    <Modal wide titleId="marketplace-detail-title" onClose={onClose}>
      <div className="marketplace-detail-heading">
        <div>
          <h2 id="marketplace-detail-title">{selected?.title ?? entry.title}</h2>
          <p>{entry.source}</p>
        </div>
        <button className="icon-button" aria-label="Close source details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {preview.isPending && <output>Loading repository definitions…</output>}
      {preview.error && (
        <div role="alert">
          <p>{preview.error.message}</p>
          <button className="button" onClick={() => void preview.refetch()}>
            Retry
          </button>
        </div>
      )}
      {preview.data && (
        <>
          <p>{selected?.description}</p>
          {selected?.url && (
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="marketplace-source-link"
            >
              View pinned source on GitHub <ArrowUpRight size={14} />
            </a>
          )}
          <h3>Repository contents</h3>
          <ul className="marketplace-contents">
            {preview.data.entries.map((item) => (
              <li key={`${item.kind}:${item.name}`}>
                <span>{item.kind}</span> {item.title} <code>{item.name}</code>
              </li>
            ))}
          </ul>
          {entries.length > 0 ? (
            <label className="marketplace-field">
              {kind === 'factory' ? 'Import factory' : `Choose ${kind}`}
              <select
                value={selected?.name ?? ''}
                onChange={(event) => {
                  setSelectedName(event.target.value);
                  add.reset();
                }}
              >
                {entries.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <output>
              This repository contains no {kind}s. Choose another type in the marketplace.
            </output>
          )}
          <div className="marketplace-files">
            <label className="marketplace-field">
              Inspect source file
              <select value={path} onChange={(event) => setPath(event.target.value)}>
                {Object.keys(preview.data.files).map((file) => (
                  <option key={file}>{file}</option>
                ))}
              </select>
            </label>
            <textarea
              readOnly
              rows={12}
              aria-label={path}
              value={preview.data.files[path] ?? ''}
              spellCheck={false}
            />
          </div>
          <label className="marketplace-field">
            Import into
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                add.reset();
              }}
              disabled={add.isPending}
            >
              <option value="" disabled>
                Choose a local factory
              </option>
              {workspace.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} · {project.workspaceRoot}
                </option>
              ))}
            </select>
          </label>
          {!workspace.projects.length && (
            <p>
              Register a local directory first with <code>openfactory project &lt;path&gt;</code>.
            </p>
          )}
          {target.error && (
            <p role="alert">
              {target.error.message}{' '}
              <button className="button" onClick={() => void target.refetch()}>
                Reload target
              </button>
            </p>
          )}
          <p className="marketplace-guidance">
            Adds new agents and teams to this factory. Existing files and settings are preserved.
            Imported agents start paused with approval required.
          </p>
          <div className="marketplace-terminal">
            <code>{command}</code>
            <button
              className="icon-button"
              aria-label="Copy import command"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(command);
                  setCopied(true);
                } catch {
                  setCopyError('Copy unavailable. Select the command to copy it.');
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {copyError && <output>{copyError}</output>}
          {add.error && <p role="alert">{add.error.message}</p>}
          {add.data ? (
            <output className="marketplace-success">
              <Check size={16} /> Imported {add.data.imported} files into {add.data.location}.
              Review and enable the agents from your factory.
            </output>
          ) : (
            <button
              className="button primary"
              disabled={!selected || !target.data || target.isFetching || add.isPending}
              onClick={() => add.mutate()}
            >
              <ArrowDownToLine size={16} />
              {add.isPending ? 'Importing…' : `Import ${kind}`}
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
