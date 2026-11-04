import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { useComputerFactories } from '../components/all-factories';
import { FactorySettings } from '../components/factory-settings';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { factoryMachine } from '../computer-workspaces';
import { projectName } from '../project-path';

export const Route = createFileRoute('/app_/projects/$project/settings')({
  validateSearch: z.object({ factory: z.string().optional() }),
  component: Settings,
});

function Settings() {
  const data = useComputerFactories();
  const { project } = Route.useParams();
  const { factory } = Route.useSearch();
  const group = data.groups.find((entry) =>
    factory
      ? entry.key === factory
      : entry.instances.some((instance) => projectName(instance.project.workspaceRoot) === project),
  );
  const displayed = group && (factoryMachine(group) ?? group.instances[0]);
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={[]}
        activeProject={displayed?.project.workspaceRoot}
        activeView="settings"
      />
      <div className="main-shell">
        <FactorySettings group={group} data={data} />
      </div>
    </div>
  );
}
