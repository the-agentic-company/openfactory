import { projectName } from '../project-path';
import { WorkspacePage } from './workspace-page';
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
  onCreate,
}: {
  agents: Agent[];
  projects: FactoryProject[];
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onCreate: () => void;
}) {
  const enabled = agents.filter((agent) => agent.enabled).length;
  return (
    <WorkspacePage
      contentClassName="factories-overview"
      title="Overview"
      actions={
        <>
          <>
            <button type="button" className="button primary" onClick={onCreate}>
              Create agent
            </button>
          </>
          <button
            type="button"
            className="button secondary"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
        </>
      }
    >
      <p className="overview-summary">
        {projects.length} factories · {agents.length} agents · {enabled} enabled
      </p>
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
              ? 'Start the OpenFactory runtime, then refresh.'
              : 'Create your first agent and choose its working directory.'}
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
                        to="/app/projects/$project/$view"
                        params={{ project: projectName(project.workspaceRoot), view: 'dashboard' }}
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
                        to="/app/projects/$project/$view"
                        params={{ project: projectName(project.workspaceRoot), view: 'agents' }}
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
    </WorkspacePage>
  );
}
