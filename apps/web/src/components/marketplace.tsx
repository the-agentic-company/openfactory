import type { MarketplaceKind } from '@openfactory/core';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Bot, Check, Copy, FileCode2, Network, Search, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  marketplaceExamples,
  marketplaceExampleCommand,
  marketplaceTypes,
  type MarketplaceExample,
} from '../marketplace-examples';
import { MarketingHeader, MarketingFooter } from './desktop-download';
import '../landing.css';
import './marketplace.css';

export function Marketplace({
  kind,
  entry,
}: {
  kind: MarketplaceKind;
  entry?: MarketplaceExample;
}) {
  return (
    <div className="landing marketplace-site">
      <MarketingHeader />
      <main className="catalog-main">
        {entry ? (
          <MarketplaceExampleDetail key={`${entry.kind}:${entry.slug}`} entry={entry} />
        ) : (
          <MarketplaceLeaderboard key={kind} kind={kind} />
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
function MarketplaceTypeTabs({ kind }: { kind: MarketplaceKind }) {
  return (
    <nav className="catalog-types" aria-label="Marketplace types">
      {marketplaceTypes.map((type) => (
        <Link
          key={type.kind}
          activeOptions={{ exact: true }}
          resetScroll={false}
          to="/marketplace/{-$type}"
          params={{ type: type.kind === 'factory' ? undefined : type.kind }}
          className={kind === type.kind ? 'selected' : ''}
          aria-current={kind === type.kind ? 'page' : undefined}
        >
          {type.label}
        </Link>
      ))}
    </nav>
  );
}

function ExampleNotice() {
  return (
    <div className="catalog-example-notice">
      <span>Example catalog</span>
      <p>
        Mock repositories and star counts, for exploring the marketplace. These examples are not
        published on GitHub.
      </p>
    </div>
  );
}
const factoryWordmark = `█████   ███    ████  █████   ███   ████   █   █
█      █   █  █        █    █   █  █   █  █   █
█      █   █  █        █    █   █  █   █   █ █ 
████   █████  █        █    █   █  ████     █  
█      █   █  █        █    █   █  █ █      █  
█      █   █  █        █    █   █  █  █     █  
█      █   █   ████    █     ███   █   █    █  `;
function MarketplaceInstallCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  return (
    <div className="catalog-install">
      <button
        className="catalog-install-command"
        aria-label={label}
        title={command}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setCopyError('');
            clearTimeout(resetTimer.current);
            resetTimer.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
            setCopyError('Clipboard unavailable. Select and copy the command.');
          }
        }}
      >
        <code>
          <span aria-hidden="true">$ </span>
          {command.endsWith('<owner/repo>') ? (
            <>
              {command.slice(0, -'<owner/repo>'.length)}
              <span className="catalog-command-placeholder">{'<owner/repo>'}</span>
            </>
          ) : (
            command
          )}
        </code>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      {copyError && <output className="catalog-install-status">{copyError}</output>}
    </div>
  );
}
function MarketplaceHero() {
  return (
    <header className="catalog-hero">
      <div className="catalog-hero-brand">
        <h1 className="catalog-visually-hidden">Factory marketplace</h1>
        <pre className="catalog-ascii" aria-hidden="true">
          {factoryWordmark}
        </pre>
        <p className="catalog-hero-tagline">The open agent factory ecosystem</p>
      </div>
      <p className="catalog-hero-description">
        Reusable agents, teams, and automations, defined in your repository. Import a factory from
        GitHub with a single command.
      </p>
      <div className="catalog-hero-install">
        <h2>Try it now</h2>
        <MarketplaceInstallCommand
          command="openfactory factory add <owner/repo>"
          label="Copy install command"
        />
      </div>
      <div className="catalog-hero-providers">
        <h2>Runs with</h2>
        <ul>
          <li>
            <img src="/brands/codex.svg" width={24} height={24} alt="" />
            Codex
          </li>
          <li>
            <img src="/brands/claude-code.svg" width={24} height={24} alt="" />
            Claude Code
          </li>
        </ul>
      </div>
    </header>
  );
}

function MarketplaceLeaderboard({ kind }: { kind: MarketplaceKind }) {
  const [search, setSearch] = useState('');
  const label = marketplaceTypes.find((type) => type.kind === kind)?.label ?? 'Factories';
  const entries = marketplaceExamples.filter(
    (entry) =>
      entry.kind === kind &&
      `${entry.title} ${entry.source} ${entry.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <MarketplaceHero />
      <label className="catalog-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <MarketplaceTypeTabs kind={kind} />
      <ExampleNotice />
      <div className="catalog-list-heading">
        <h2>{label} leaderboard</h2>
        <span>Sample GitHub stars</span>
      </div>
      <output className="catalog-result-count">
        {entries.length} {entries.length === 1 ? 'example' : 'examples'}
        {search ? ` matching “${search}”` : ''}
      </output>
      <ol className="catalog-list">
        {entries.map((item, index) => (
          <li key={item.slug}>
            <Link
              className="catalog-row"
              to="/marketplace/$type/$slug"
              params={{ type: item.kind, slug: item.slug }}
            >
              <span className="catalog-rank">{index + 1}</span>
              <span className="catalog-entry-copy">
                <strong>{item.title}</strong>
                <small>{item.source}</small>
                <span>{item.description}</span>
                <span className="catalog-inventory">
                  <span>
                    <Bot size={13} aria-hidden="true" />
                    {item.agentCount} {item.agentCount === 1 ? 'agent' : 'agents'}
                  </span>
                  {item.teamCount > 0 && (
                    <span>
                      <Network size={13} aria-hidden="true" />
                      {item.teamCount} team
                    </span>
                  )}
                </span>
              </span>
              <span className="catalog-stars">
                <Star size={14} aria-hidden="true" />
                {item.stars?.toLocaleString()}
              </span>
              <ArrowRight className="catalog-row-arrow" size={17} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      {entries.length === 0 && (
        <div className="catalog-empty">
          <h3>No matching examples</h3>
          <p>Try a different name or repository.</p>
          <button className="catalog-button" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      )}
      <p className="catalog-publish">
        Sharing a real factory? Commit a <code>factory/</code> directory and add the{' '}
        <code>openfactory-{kind}</code> GitHub topic.{' '}
        <Link to="/docs/$" params={{ _splat: 'marketplace' }}>
          Read the publishing guide <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </p>
    </>
  );
}
function MarketplaceExampleDetail({ entry }: { entry: MarketplaceExample }) {
  const agentFile = Object.keys(entry.files).find((file) => file.startsWith('agents/'));
  const [path, setPath] = useState(
    entry.kind === 'agent' || entry.kind === 'automation'
      ? (agentFile ?? 'factory.yaml')
      : 'factory.yaml',
  );
  const [installMode, setInstallMode] = useState<'command' | 'prompt'>('command');
  const [sourceMode, setSourceMode] = useState<'read' | 'source'>('read');
  const [owner = '', repository = ''] = entry.source.split('/');
  const command = marketplaceExampleCommand(entry);
  const prompt = `Import the ${entry.kind} "${entry.title}" from https://github.com/${entry.source} into the current directory using OpenFactory. Keep imported agents paused and require approval before running them.`;
  const source = entry.files[path] ?? '';
  const markdown = path.endsWith('.md');
  const instructions = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/^# [^\n]*\n/, '')
    .trim();
  const kindLabel = {
    factory: 'Factory',
    agent: 'Agent workflows',
    automation: 'Scheduled automation',
    team: 'Agent team',
  }[entry.kind];
  return (
    <article className="catalog-detail">
      <nav className="catalog-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/marketplace/{-$type}" params={{ type: undefined }}>
              marketplace
            </Link>
          </li>
          <li>
            <span>{owner}</span>
          </li>
          <li>
            <span>{repository}</span>
          </li>
          <li>
            <span aria-current="page">{entry.name === 'factory' ? entry.slug : entry.name}</span>
          </li>
        </ol>
      </nav>
      <header className="catalog-detail-heading">
        <h1>{entry.title}</h1>
        <div className="catalog-detail-tags">
          <span>{kindLabel}</span>
          <span className="catalog-example-tag">Example data</span>
        </div>
      </header>
      <div className="catalog-detail-columns">
        <div className="catalog-detail-body">
          <section className="catalog-detail-section" aria-labelledby="catalog-install-heading">
            <div className="catalog-section-heading">
              <h2 id="catalog-install-heading">Installation</h2>
              <fieldset className="catalog-mode-switch" aria-label="Installation format">
                <button
                  aria-pressed={installMode === 'command'}
                  onClick={() => setInstallMode('command')}
                >
                  Command
                </button>
                <button
                  aria-pressed={installMode === 'prompt'}
                  onClick={() => setInstallMode('prompt')}
                >
                  Prompt
                </button>
              </fieldset>
            </div>
            <MarketplaceInstallCommand
              key={installMode}
              command={installMode === 'command' ? command : prompt}
              label={
                installMode === 'command'
                  ? 'Copy example import command'
                  : 'Copy example import prompt'
              }
            />
          </section>
          <section className="catalog-detail-section" aria-labelledby="catalog-document-heading">
            <div className="catalog-section-heading">
              <h2 id="catalog-document-heading">{path.split('/').at(-1)}</h2>
              {markdown && (
                <fieldset className="catalog-mode-switch" aria-label="File view">
                  <button
                    aria-pressed={sourceMode === 'read'}
                    onClick={() => setSourceMode('read')}
                  >
                    Read
                  </button>
                  <button
                    aria-pressed={sourceMode === 'source'}
                    onClick={() => setSourceMode('source')}
                  >
                    Source
                  </button>
                </fieldset>
              )}
            </div>
            <nav className="catalog-file-tabs" aria-label="Source files">
              {Object.keys(entry.files).map((file) => (
                <button key={file} aria-pressed={path === file} onClick={() => setPath(file)}>
                  {file}
                </button>
              ))}
            </nav>
            {markdown && sourceMode === 'read' ? (
              <div className="catalog-document">
                <h3>{entry.title}</h3>
                {instructions.split(/\n\n+/).map((paragraph) => (
                  <p key={`${path}:${paragraph}`}>{paragraph}</p>
                ))}
                <h4>When to use this {entry.kind}</h4>
                <p>
                  Use it from your repository when you need{' '}
                  {entry.kind === 'automation'
                    ? 'recurring work on a schedule'
                    : 'the workflow described above'}
                  . Read the project instructions before starting and review the results before
                  applying changes.
                </p>
              </div>
            ) : (
              <div className="catalog-raw-source">
                <label htmlFor="catalog-file-content">factory/{path}</label>
                <textarea
                  id="catalog-file-content"
                  readOnly
                  spellCheck={false}
                  value={source}
                  rows={16}
                />
              </div>
            )}
          </section>
          <p className="catalog-detail-guide">
            <Link to="/docs/$" params={{ _splat: 'marketplace' }}>
              Read the import and publishing guide <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </p>
        </div>
        <aside className="catalog-metadata" aria-label="Example repository metadata">
          <section>
            <h2>
              Installs <span>Sample</span>
            </h2>
            <p className="catalog-install-total">
              {new Intl.NumberFormat('en', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(entry.installs)}
            </p>
          </section>
          <section>
            <h2>Repository</h2>
            <p className="catalog-metadata-repository">{entry.source}</p>
          </section>
          <section>
            <h2>GitHub stars</h2>
            <p className="catalog-metadata-stars">
              <Star size={18} aria-hidden="true" />
              {entry.stars?.toLocaleString()}
            </p>
          </section>
          <section>
            <h2>First seen</h2>
            <p>
              <time dateTime={entry.firstSeen}>
                {new Intl.DateTimeFormat('en', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(entry.firstSeen))}
              </time>
            </p>
          </section>
          <section>
            <h2>Contents</h2>
            <ul>
              <li>
                <Bot size={15} aria-hidden="true" />
                {entry.agentCount} {entry.agentCount === 1 ? 'agent' : 'agents'}
              </li>
              <li>
                <Network size={15} aria-hidden="true" />
                {entry.teamCount} {entry.teamCount === 1 ? 'team' : 'teams'}
              </li>
              <li>
                <FileCode2 size={15} aria-hidden="true" />
                {Object.keys(entry.files).length} files
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </article>
  );
}
