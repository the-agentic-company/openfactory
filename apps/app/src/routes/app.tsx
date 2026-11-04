import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AllFactories, useComputerFactories } from '../components/all-factories';
import { NewAgent } from '../components/new-agent';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { getAgents } from '../server/agents';

export const Route = createFileRoute('/app')({ component: Overview });

function Overview() {
  const factories = useComputerFactories();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    refetchInterval: 10000,
  });
  const [creating, setCreating] = useState(false);
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={query.data?.agents ?? []}
        projects={query.data?.projects ?? []}
        activeView="overview"
      />
      <div className="main-shell">
        <AllFactories data={factories} onCreate={() => setCreating(true)} />
      </div>
      {creating && (
        <NewAgent
          agents={query.data?.agents ?? []}
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
