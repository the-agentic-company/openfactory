import { WorkspacePage } from './workspace-page';
export function WorkspaceUnavailable({
  error,
  retry,
}: {
  error: string | null;
  retry: () => void;
}) {
  return (
    <div className="app-shell">
      <div className="main-shell">
        <WorkspacePage title="Factory unavailable">
          <div className="empty-state" role="alert">
            <h1>Unable to load your factory</h1>
            <p>{error ?? 'The runtime is unavailable. Please try again.'}</p>
            <button className="button primary" onClick={retry}>
              Retry connection
            </button>
            <a href="/app">Back to overview</a>
          </div>
        </WorkspacePage>
      </div>
    </div>
  );
}
