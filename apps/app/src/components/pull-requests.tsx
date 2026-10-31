import { Select, SelectItem } from './ui/select';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import {
  ArrowUpRight,
  CircleCheck,
  Clock3,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { PullRequestSnapshot } from '@openfactory/core';
import { useState } from 'react';
import { getPullRequests } from '../server/pull-requests';
import '../pull-requests.css';
import { pullRequestQueryOptions } from '../client/pull-request-query';

const states = {
  OPEN: { label: 'Open', icon: GitPullRequest, color: 'clean' },
  DRAFT: { label: 'Draft', icon: GitPullRequest, color: 'skipped' },
  MERGED: { label: 'Merged', icon: GitMerge, color: 'merged' },
  CLOSED: { label: 'Closed', icon: GitPullRequestClosed, color: 'closed' },
};
const reviews = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  REVIEW_REQUIRED: 'Review required',
  '': 'Not reviewed',
};
const checks = {
  passed: { label: 'Passed', icon: CircleCheck, color: 'clean' },
  failed: { label: 'Failed', icon: ShieldAlert, color: 'issues' },
  pending: { label: 'Pending', icon: Clock3, color: 'skipped' },
  none: { label: 'No checks', icon: Clock3, color: 'skipped' },
};
function relativeTime(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return `${Math.floor(minutes / 1440)}d ago`;
}

type PullRequest = Awaited<ReturnType<typeof getPullRequests>>['pulls'][number];
const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, PullRequest>();
const columns = [
  columnHelper.display({
    id: 'title',
    header: 'Pull request',
    cell: ({ row: { original: pr } }) => {
      return (
        <>
          <a className="pr-title" href={pr.url} target="_blank" rel="noreferrer">
            <span>#{pr.number}</span> {pr.title} <ArrowUpRight size={12} className="pr-external" />
          </a>
          <div className="pr-meta">
            <a href={`https://github.com/${pr.repository}`} target="_blank" rel="noreferrer">
              {pr.repository}
            </a>
            <span aria-hidden="true">·</span>
            <a href={`https://github.com/${pr.author}`} target="_blank" rel="noreferrer">
              {pr.author}
            </a>
          </div>
        </>
      );
    },
  }),
  columnHelper.display({
    id: 'state',
    header: 'Status',
    cell: ({ row: { original: pr } }) => {
      const state = states[pr.state];
      return (
        <>
          <span className={`pr-outcome ${state.color}`}>
            <state.icon size={15} />
            {state.label}
          </span>
        </>
      );
    },
  }),
  columnHelper.display({
    id: 'review',
    header: 'Review',
    cell: ({ row: { original: pr } }) => {
      return <>{reviews[pr.review]}</>;
    },
  }),
  columnHelper.display({
    id: 'checks',
    header: 'Checks',
    cell: ({ row: { original: pr } }) => {
      const check = checks[pr.checks];
      return (
        <>
          <span className={`pr-outcome ${check.color}`}>
            <check.icon size={14} />
            {check.label}
          </span>
        </>
      );
    },
  }),
  columnHelper.display({
    id: 'changes',
    header: 'Changes',
    cell: ({ row: { original: pr } }) => {
      return (
        <>
          <span className="pr-additions">+{pr.additions}</span>{' '}
          <span className="pr-deletions">−{pr.deletions}</span>
        </>
      );
    },
  }),
  columnHelper.display({
    id: 'updatedAt',
    header: 'Updated',
    cell: ({ row: { original: pr } }) => {
      return (
        <time dateTime={pr.updatedAt} title={pr.updatedAt}>
          {relativeTime(pr.updatedAt)}
        </time>
      );
    },
  }),
];

export function PullRequests({
  project,
  scope,
  snapshot,
}: {
  project: string;
  scope: string;
  snapshot: PullRequestSnapshot | null;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [repository, setRepository] = useState('all');
  const [author, setAuthor] = useState('all');
  const [period, setPeriod] = useState<1 | 7 | 30>(30);
  const initial = snapshot?.scope === scope && snapshot.project === project ? snapshot : null;
  const query = useQuery({
    ...pullRequestQueryOptions(scope, project, period, () =>
      getPullRequests({ data: { project, days: period } }),
    ),
    initialData: initial
      ? {
          ...initial.result,
          pulls:
            period === initial.days
              ? initial.result.pulls
              : initial.result.pulls.filter(
                  (pr) => Date.parse(pr.updatedAt) >= initial.updatedAt - period * 86400000,
                ),
        }
      : undefined,
    initialDataUpdatedAt: initial?.updatedAt,
    refetchOnMount: 'always',
  });
  const pulls = query.data?.pulls ?? [];
  const shown = pulls.filter(
    (pr) =>
      (status === 'all' || pr.state === status) &&
      (repository === 'all' || pr.repository === repository) &&
      (author === 'all' || pr.author === author) &&
      `${pr.number} ${pr.title} ${pr.repository} ${pr.author}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const table = useTable({
    columns,
    data: shown,
    features,
    getRowId: (pr) => pr.url,
  });
  const filtered =
    search !== '' || status !== 'all' || repository !== 'all' || author !== 'all' || period !== 30;
  function clearFilters() {
    setSearch('');
    setStatus('all');
    setRepository('all');
    setAuthor('all');
    setPeriod(30);
  }
  return (
    <section className="pr-page" aria-label="Pull requests">
      <div className="pr-toolbar">
        <label className="search pr-search">
          <Search size={15} />
          <input
            aria-label="Search pull requests"
            placeholder="Search pull requests…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="pr-filters">
          <Select
            aria-label="Repository"
            value={repository}
            onValueChange={(value) => setRepository(value)}
          >
            <SelectItem value="all">All repositories</SelectItem>
            {(query.data?.repositories ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </Select>
          <Select aria-label="Author" value={author} onValueChange={(value) => setAuthor(value)}>
            <SelectItem value="all">All authors</SelectItem>
            {[...new Set(pulls.map((pr) => pr.author))].sort().map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </Select>
          <Select
            aria-label="Updated within"
            value={period}
            onValueChange={(value) => setPeriod(value === '1' ? 1 : value === '7' ? 7 : 30)}
          >
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </Select>
          <button
            className="icon-button"
            aria-label="Refresh pull requests"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={15} className={query.isPending ? 'spinning' : ''} />
          </button>
        </div>
      </div>
      {query.isError && (
        <div className="error-banner" role="alert">
          {query.data
            ? 'Could not refresh pull requests. Showing saved results.'
            : 'Could not load pull requests.'}{' '}
          {query.error.message}
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      {query.data && query.data.unavailable.length > 0 && (
        <div className="error-banner" role="alert">
          GitHub could not load {query.data.unavailable.join(', ')}. Check the server’s GitHub CLI
          access.<button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      <div className="pr-list-heading">
        <Select
          aria-label="Pull request status"
          value={status}
          onValueChange={(value) => setStatus(value)}
        >
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="OPEN">Open</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="MERGED">Merged</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </Select>
        <output>
          {query.isPending
            ? 'Loading…'
            : `${shown.length} pull ${shown.length === 1 ? 'request' : 'requests'}`}
          {filtered && (
            <button onClick={clearFilters}>
              Clear filters <X size={12} />
            </button>
          )}
        </output>
      </div>
      <section className="pr-table-scroll" aria-label="Pull request results">
        <table className="pr-table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {query.isPending && (
          <output className="pr-empty">
            <RefreshCw size={22} className="spinning" />
            Loading from GitHub…
          </output>
        )}
        {query.isSuccess && shown.length === 0 && query.data.unavailable.length === 0 && (
          <div className="pr-empty">
            <GitPullRequest size={27} />
            <h2>{filtered ? 'No matching pull requests' : 'No recent pull requests'}</h2>
            {filtered && (
              <button className="button secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
      {query.data && query.data.unlinked.length > 0 && (
        <p className="pr-footer">No GitHub origin remote: {query.data.unlinked.join(', ')}.</p>
      )}
      {query.data?.limited && (
        <p className="pr-footer">
          Showing up to 100 recently updated pull requests per repository. Open the repository on
          GitHub for its full history.
        </p>
      )}
    </section>
  );
}
