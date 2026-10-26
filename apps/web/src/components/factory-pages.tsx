import { scoreOutput, type Agent, type Scorer, type WorkspaceView } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { matchesRunFilter, RunList, runFilters, type RunFilter } from './run-list';
import { ChevronRight, Plus, RefreshCw, ScanLine, Search, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createScorer, deleteScorer, getFactoryRuns, getScorers } from '../server/factory';
import { FactoryDashboard } from './factory-dashboard';

type FactoryRun = Awaited<ReturnType<typeof getFactoryRuns>>['runs'][number];
const completedStatuses = ['completed', 'succeeded'];
function time(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function FactoryPages({
  view,
  project,
  agents,
  factoryName,
}: {
  view: Exclude<WorkspaceView, 'agents' | 'pull-requests' | 'definition'>;
  project: string;
  agents: Agent[];
  factoryName?: string;
}) {
  const query = useQuery({
    queryKey: ['factory-runs', project],
    queryFn: () => getFactoryRuns({ data: { project } }),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const scorers = useQuery({ queryKey: ['scorers'], queryFn: () => getScorers() });
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const [runFilter, setRunFilter] = useState<RunFilter>('all');
  const openRun = (run: FactoryRun) => {
    void navigate({
      to: '/runs/$runId',
      params: { runId: run.id },
      search: { thread: run.threadId, project },
    });
  };
  const [creating, setCreating] = useState(false);
  const runs = query.data?.runs ?? [];
  const projectScorers = (scorers.data ?? []).filter(
    (s) => project === 'all' || s.project === project,
  );
  return (
    <>
      {query.isError && (
        <div className="error-banner" role="alert">
          Run history could not be loaded. {query.error.message}{' '}
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      {query.isPending && (
        <output className="factory-loading">
          <RefreshCw size={18} className="spinning" />
          Loading runs…
        </output>
      )}
      {query.data && query.data.unavailable > 0 && (
        <p className="data-scope">{query.data.unavailable} conversations could not be read.</p>
      )}
      {view === 'dashboard' && (
        <FactoryDashboard
          runs={runs}
          agents={agents}
          loaded={!!query.data}
          refreshing={query.isFetching}
          onRefresh={() => {
            void query.refetch();
          }}
          renderRuns={(recent) => <RunList runs={recent} agents={agents} project={project} />}
        />
      )}
      {view === 'runs' && (
        <>
          <div className="runs-controls">
            <nav className="runs-filter-tabs" aria-label="Filter runs">
              {runFilters.map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  className={runFilter === filter.id ? 'selected' : ''}
                  aria-pressed={runFilter === filter.id}
                  onClick={() => setRunFilter(filter.id)}
                >
                  {filter.id === 'all' ? (factoryName ?? 'All runs') : filter.label}
                </button>
              ))}
            </nav>
            <div className="runs-search-actions">
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search runs"
                  placeholder="Search runs…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label="Refresh runs"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw size={15} className={query.isFetching ? 'spinning' : ''} />
              </button>
            </div>
          </div>
          {query.data && (
            <RunList
              runs={runs.filter(
                (run) =>
                  matchesRunFilter(run, runFilter) &&
                  `${run.title} ${run.request} ${agents.find((agent) => agent.id === run.agentId)?.title ?? ''}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )}
              agents={agents}
              project={project}
            />
          )}
        </>
      )}
      {view === 'scorers' && (
        <>
          <div className="section-heading">
            <p>Repeatable checks against completed assistant output. No additional model calls.</p>
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={15} />
              New scorer
            </button>
          </div>
          {scorers.isError && (
            <div className="error-banner" role="alert">
              Scorers could not be loaded.{' '}
              <button onClick={() => void scorers.refetch()}>Retry</button>
            </div>
          )}
          <div className="scorer-list">
            {projectScorers.map((scorer) => (
              <ScorerCard
                key={scorer.id}
                scorer={scorer}
                runs={runs}
                agents={agents}
                onOpen={openRun}
              />
            ))}
            {projectScorers.length === 0 && !scorers.isPending && (
              <Empty
                title="Define what a good run looks like"
                text="Create a scorer to check required text, excluded text, or the minimum length of an agent’s response."
              />
            )}
          </div>
        </>
      )}
      {creating && (
        <NewScorer project={project} agents={agents} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state factory-empty">
      <ScanLine size={27} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function ruleLabel(rule: Scorer['rule']) {
  return rule.type === 'min_length'
    ? `At least ${rule.length} ${rule.length === 1 ? 'character' : 'characters'}`
    : `${rule.type === 'contains' ? 'Includes' : 'Excludes'} “${rule.text}”`;
}
function ScorerCard({
  scorer,
  runs,
  agents,
  onOpen,
}: {
  scorer: Scorer;
  runs: FactoryRun[];
  agents: Agent[];
  onOpen: (run: FactoryRun) => void;
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteScorer({ data: { id: scorer.id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['scorers'] }),
  });
  const eligible = runs.filter(
    (run) =>
      (scorer.project === 'all' ||
        run.projectPath === scorer.project ||
        run.projectId === scorer.project) &&
      completedStatuses.includes(run.status) &&
      !run.outputTruncated &&
      run.output &&
      (!scorer.agentId || run.agentId === scorer.agentId),
  );
  const results = eligible.map((run) => ({ run, pass: scoreOutput(scorer.rule, run.output) }));
  return (
    <section className="scorer-card">
      <div className="scorer-card-heading">
        <span className="scorer-glyph">
          <ScanLine size={20} />
        </span>
        <div>
          <h2>{scorer.name}</h2>
          <p>
            {ruleLabel(scorer.rule)} ·{' '}
            {agents.find((a) => a.id === scorer.agentId)?.title ?? 'All factory runs'}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={`Delete ${scorer.name}`}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="scorer-card-footer">
        <span>
          {results.filter((r) => r.pass).length} passed · {results.filter((r) => !r.pass).length}{' '}
          failed · {eligible.length} evaluated
        </span>
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide results' : 'View results'}
          <ChevronRight size={14} />
        </button>
      </div>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {expanded && (
        <div className="score-results">
          {results.length ? (
            results.map(({ run, pass }) => (
              <button key={`${run.threadId}:${run.id}`} onClick={() => onOpen(run)}>
                <span className={pass ? 'score-pass' : 'score-fail'}>{pass ? 'Pass' : 'Fail'}</span>
                <span>{run.title}</span>
                <time>{time(run.requestedAt)}</time>
              </button>
            ))
          ) : (
            <p>No completed runs with output match this scorer yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
function NewScorer({
  project,
  agents,
  onClose,
}: {
  project: string;
  agents: Agent[];
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('all');
  const [kind, setKind] = useState<'contains' | 'excludes' | 'min_length'>('contains');
  const [value, setValue] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      createScorer({
        data: {
          name,
          project,
          agentId: agentId === 'all' ? null : agentId,
          rule:
            kind === 'min_length'
              ? { type: kind, length: Number(value) }
              : { type: kind, text: value },
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['scorers'] });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  return (
    <dialog
      className="scorer-dialog"
      ref={(node) => {
        if (node && !node.open) {
          node.showModal();
        }
      }}
      onCancel={onClose}
      aria-labelledby="scorer-title"
    >
      <div className="modal-heading">
        <button className="icon-button" aria-label="Close scorer editor" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="scorer-title">New scorer</h2>
      <p>Check the saved assistant response without starting another agent.</p>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Successful smoke test"
          />
        </label>
        <label>
          Apply to
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="all">All runs in this factory</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rule
          <select
            value={kind}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'contains' || v === 'excludes' || v === 'min_length') {
                setKind(v);
              }
              setValue('');
            }}
          >
            <option value="contains">Output includes text</option>
            <option value="excludes">Output excludes text</option>
            <option value="min_length">Minimum output length</option>
          </select>
        </label>
        <label>
          {kind === 'min_length' ? 'Characters' : 'Text to check'}
          <input
            required
            type={kind === 'min_length' ? 'number' : 'text'}
            min={kind === 'min_length' ? 1 : undefined}
            max={kind === 'min_length' ? 100000 : undefined}
            maxLength={1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === 'min_length' ? '100' : 'OPENFACTORY_INTERVAL_OK'}
          />
        </label>
        {mutation.isError && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Create scorer'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
