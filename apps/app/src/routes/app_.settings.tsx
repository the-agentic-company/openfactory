import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { getAgents } from '../server/agents';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { SettingsModal } from '../components/settings-modal';

export const Route = createFileRoute('/app_/settings')({
  loader: () => getAgents(),
  component: Settings,
});
function Settings() {
  const workspace = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={workspace.agents}
        projects={workspace.projects}
        activeView="settings"
      />
      <div className="main-shell">
        <SettingsModal onClose={() => void navigate({ to: '/app' })} />
      </div>
    </div>
  );
}
