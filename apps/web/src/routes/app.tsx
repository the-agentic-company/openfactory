import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { FactoriesOverview } from '../components/factories-overview';
import { NewAgent } from '../components/new-agent';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { getAgents } from '../server/agents';

export const Route = createFileRoute('/app')({ loader: () => getAgents(), component: Overview });

function Overview() {
  const initialData = Route.useLoaderData();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    initialData,
    refetchInterval: 10000,
  });
  const [creating, setCreating] = useState(false);
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={query.data.agents}
        projects={query.data.projects}
        activeView="overview"
      />
      <div className="main-shell">
        <FactoriesOverview
          agents={query.data.agents}
          projects={query.data.projects}
          error={query.data.error}
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
          onCreate={() => setCreating(true)}
        />
      </div>
      {creating && (
        <NewAgent
          agents={query.data.agents}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void client.invalidateQueries({ queryKey: ['agents'] });
          }}
        />
      )}
    </div>
  );
}
