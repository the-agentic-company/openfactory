import { useQuery } from '@tanstack/react-query';
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
import { useState } from 'react';
import { getPullRequests } from '../server/pull-requests';
import '../pull-requests.css';

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
export function PullRequests({ project }: { project: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [repository, setRepository] = useState('all');
  const [author, setAuthor] = useState('all');
  const [period, setPeriod] = useState<1 | 7 | 30>(30);
  const query = useQuery({
    queryKey: ['pull-requests', project, period],
    queryFn: () => getPullRequests({ data: { project, days: period } }),
    refetchInterval: 60000,
    staleTime: 30000,
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
          <select
            aria-label="Repository"
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
          >
            <option value="all">All repositories</option>
            {(query.data?.repositories ?? []).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select
            aria-label="Author"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          >
            <option value="all">All authors</option>
            {[...new Set(pulls.map((pr) => pr.author))].sort().map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select
            aria-label="Updated within"
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value === '1' ? 1 : event.target.value === '7' ? 7 : 30)
            }
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <button
            className="icon-button"
            aria-label="Refresh pull requests"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={15} className={query.isFetching ? 'spinning' : ''} />
          </button>
        </div>
      </div>
      {query.isError && (
        <div className="error-banner" role="alert">
          Could not load pull requests. {query.error.message}
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
        <select
          aria-label="Pull request status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="DRAFT">Draft</option>
          <option value="MERGED">Merged</option>
          <option value="CLOSED">Closed</option>
        </select>
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
            <tr>
              <th scope="col">Pull request</th>
              <th scope="col">Status</th>
              <th scope="col">Review</th>
              <th scope="col">Checks</th>
              <th scope="col">Changes</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((pr) => {
              const state = states[pr.state];
              const check = checks[pr.checks];
              return (
                <tr key={pr.url}>
                  <td>
                    <a className="pr-title" href={pr.url} target="_blank" rel="noreferrer">
                      <span>#{pr.number}</span> {pr.title}{' '}
                      <ArrowUpRight size={12} className="pr-external" />
                    </a>
                    <div className="pr-meta">
                      <a
                        href={`https://github.com/${pr.repository}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pr.repository}
                      </a>
                      <span aria-hidden="true">·</span>
                      <a href={`https://github.com/${pr.author}`} target="_blank" rel="noreferrer">
                        {pr.author}
                      </a>
                    </div>
                  </td>
                  <td>
                    <span className={`pr-outcome ${state.color}`}>
                      <state.icon size={15} />
                      {state.label}
                    </span>
                  </td>
                  <td>{reviews[pr.review]}</td>
                  <td>
                    <span className={`pr-outcome ${check.color}`}>
                      <check.icon size={14} />
                      {check.label}
                    </span>
                  </td>
                  <td>
                    <span className="pr-additions">+{pr.additions}</span>{' '}
                    <span className="pr-deletions">−{pr.deletions}</span>
                  </td>
                  <td>
                    <time dateTime={pr.updatedAt} title={pr.updatedAt}>
                      {relativeTime(pr.updatedAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
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
