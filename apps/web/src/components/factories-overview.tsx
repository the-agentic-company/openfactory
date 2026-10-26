import type { Agent } from '@openfactory/core';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { AppearanceGlyph } from './appearance-glyph';
import type { FactoryProject } from './factory-navigation-item';

export function FactoriesOverview({
  agents,
  projects,
  error,
  refreshing,
  onRefresh,
}: {
  agents: Agent[];
  projects: FactoryProject[];
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const enabled = agents.filter((agent) => agent.enabled).length;
  return (
    <section className="factories-overview" aria-labelledby="overview-title">
      <div className="overview-heading">
        <div>
          <h1 id="overview-title">Overview</h1>
          <p>
            {projects.length} factories · {agents.length} agents · {enabled} enabled
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />
          Refresh
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {projects.length === 0 ? (
        <div className="empty-state">
          <h2>No factories available</h2>
          <p>
            {error
              ? 'Reconnect to T3 Code, then refresh.'
              : 'Projects connected to T3 Code will appear here.'}
          </p>
        </div>
      ) : (
        <section className="overview-table-scroll" aria-label="All factories">
          <table className="overview-table">
            <caption>All factories</caption>
            <thead>
              <tr>
                <th scope="col">Factory</th>
                <th scope="col">Agents</th>
                <th scope="col">Enabled</th>
                <th scope="col">Last dispatch failed</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const members = agents.filter((agent) => agent.projectId === project.id);
                return (
                  <tr key={project.id}>
                    <th scope="row">
                      <Link
                        to="/"
                        search={{ project: project.workspaceRoot, view: 'dashboard' }}
                        className="overview-factory-link"
                      >
                        <AppearanceGlyph
                          appearance={
                            project.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }
                          }
                          size={20}
                        />
                        <span>
                          <strong>{project.title}</strong>
                          <small>{project.workspaceRoot}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </Link>
                    </th>
                    <td>
                      <Link
                        to="/"
                        search={{ project: project.workspaceRoot, view: 'agents' }}
                        aria-label={`${project.title}: ${members.length} agents`}
                      >
                        {members.length}
                      </Link>
                    </td>
                    <td>{members.filter((agent) => agent.enabled).length}</td>
                    <td>{members.filter((agent) => agent.lastRunStatus === 'failed').length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
