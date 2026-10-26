import { relativeRunTime, runBucket, runLinks, type Agent } from '@openfactory/core';
import { Link } from '@tanstack/react-router';
import {
  Bot,
  Check,
  CircleDashed,
  GitPullRequest,
  Globe,
  LoaderCircle,
  OctagonX,
  Pause,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { getFactoryRuns } from '../server/factory';
export type FactoryRun = Awaited<ReturnType<typeof getFactoryRuns>>['runs'][number];
export function RunStatusIcon({ status }: { status: string }) {
  const bucket = runBucket(status);
  const Icon =
    bucket === 'complete'
      ? Check
      : bucket === 'running'
        ? LoaderCircle
        : bucket === 'failed'
          ? OctagonX
          : bucket === 'blocked'
            ? Pause
            : bucket === 'cancelled'
              ? X
              : CircleDashed;
  return (
    <span className={`run-state-icon ${bucket}`} title={status} aria-label={status}>
      <Icon size={17} strokeWidth={2} className={bucket === 'running' ? 'spinning' : ''} />
    </span>
  );
}
export function runSource(run: Pick<FactoryRun, 'agentId' | 'creationSource'>) {
  if (run.agentId) {
    return 'Scheduled';
  }
  switch (run.creationSource) {
    case 'web':
      return 'Web';
    case 'mobile':
      return 'Mobile';
    case 'mcp':
      return 'MCP';
    case 'provider':
      return 'Agent';
    case 'server':
      return 'Server';
    default:
      return 'Conversation';
  }
}
export function RunList({
  runs,
  agents,
  project,
}: {
  runs: FactoryRun[];
  agents: Agent[];
  project: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  if (!runs.length) {
    return (
      <div className="runs-empty">
        <CircleDashed size={25} />
        <h2>No runs in this view</h2>
        <p>Choose another filter or start an agent.</p>
      </div>
    );
  }
  return (
    <div className="compact-run-list" aria-label="Run list">
      {runs.map((run) => {
        const agent = agents.find((item) => item.id === run.agentId);
        const prs = runLinks(`${run.request}\n${run.output}`)
          .filter((link) => link.kind === 'pr')
          .slice(0, 2);
        return (
          <Link
            key={`${run.threadId}:${run.id}`}
            to="/runs/$runId"
            params={{ runId: run.id }}
            search={{ thread: run.threadId, project }}
            className="compact-run-row"
            aria-label={`Open ${run.title}`}
          >
            <RunStatusIcon status={run.status} />
            <span className="compact-run-title" title={run.request || run.title}>
              {run.title}
            </span>
            <span className="compact-run-metadata">
              {prs.map((pr) => (
                <span key={pr.url} className="run-reference-chip" title={pr.label}>
                  <GitPullRequest size={13} />
                  {pr.label.split('#').at(-1) ? `PR ${pr.label.split('#').at(-1)}` : 'PR'}
                </span>
              ))}
              <span className="run-source-chip">
                <Globe size={13} />
                {runSource(run)}
              </span>
              <span
                className="run-author"
                title={agent?.title ?? (run.createdBy === 'user' ? 'You' : 'Agent conversation')}
              >
                {agent ? <Bot size={14} /> : <UserRound size={14} />}
              </span>
              <time dateTime={run.requestedAt} title={new Date(run.requestedAt).toLocaleString()}>
                {relativeRunTime(run.requestedAt, now)}
              </time>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
export const runFilters = [
  { id: 'all', label: 'All runs' },
  { id: 'mine', label: 'My runs' },
  { id: 'running', label: 'Running' },
  { id: 'complete', label: 'Complete' },
  { id: 'failed', label: 'Failed' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'background', label: 'Background runs' },
  { id: 'scheduled', label: 'Scheduled' },
] as const;
export type RunFilter = (typeof runFilters)[number]['id'];
export function matchesRunFilter(run: FactoryRun, filter: RunFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'mine') {
    return run.createdBy === 'user' && !run.agentId;
  }
  if (filter === 'scheduled') {
    return Boolean(run.agentId);
  }
  if (filter === 'background') {
    return Boolean(run.createdBy && run.createdBy !== 'user' && !run.agentId);
  }
  return runBucket(run.status) === filter;
}
