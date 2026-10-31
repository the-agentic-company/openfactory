import { createFileRoute } from '@tanstack/react-router';
import { getAgents } from '../server/agents';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { ConnectionSettings } from '../components/connection-settings';

export const Route = createFileRoute('/app_/settings')({
  loader: () => getAgents(),
  component: Settings,
});
function Settings() {
  const workspace = Route.useLoaderData();
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={workspace.agents}
        projects={workspace.projects}
        activeView="settings"
      />
      <div className="main-shell">
        <ConnectionSettings />
      </div>
    </div>
  );
}
