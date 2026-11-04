import { ConnectionRecovery } from './connection-recovery';
import { WorkspacePage } from './workspace-page';
import { WorkspaceSidebar } from './workspace-sidebar';
export function WorkspaceUnavailable({
  error,
  retry,
}: {
  error: string | null;
  retry: () => void;
}) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar agents={[]} />
      <div className="main-shell">
        <WorkspacePage title="Factory unavailable">
          <ConnectionRecovery
            title="Unable to load your factory"
            error={
              error ??
              'Cannot connect to OpenFactory. Check the computers below, then retry the connection.'
            }
            retry={retry}
            back
          />
        </WorkspacePage>
      </div>
    </div>
  );
}
