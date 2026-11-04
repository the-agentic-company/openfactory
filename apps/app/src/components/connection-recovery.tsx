import { useMutation, useQuery } from '@tanstack/react-query';
import { MonitorX, RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import * as connections from '../server/connections';
import { ComputerConnectionRow, loadSettings, native } from './computer-connections';
import './connection-recovery.css';

const subscribeMounted = () => () => {};

export function ConnectionRecovery({
  title,
  error,
  retry,
  refreshing = false,
  back = false,
}: {
  title: string;
  error: string;
  retry: () => void;
  refreshing?: boolean;
  back?: boolean;
}) {
  return (
    <section className="connection-recovery" aria-label="Connection recovery">
      <div className="connection-recovery-message" role="alert">
        <MonitorX size={24} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{error}</p>
          <div className="connection-recovery-actions">
            <button type="button" className="button primary" onClick={retry} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
              {refreshing ? 'Connecting…' : 'Retry connection'}
            </button>
            <a className="button secondary" href="/app/settings">
              Open Settings
            </a>
            {back && (
              <a className="connection-recovery-back" href="/app">
                Back to overview
              </a>
            )}
          </div>
        </div>
      </div>
      <RecoveryComputers />
    </section>
  );
}

function RecoveryComputers() {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );
  const query = useQuery({
    queryKey: ['connection-settings'],
    queryFn: loadSettings,
    enabled: mounted,
    refetchInterval: 10000,
  });
  const select = useMutation({
    mutationFn: async (id: string) => {
      const api = native();
      if (api) {
        await api.invoke('select-computer', { id });
      } else {
        await connections.selectComputer({ data: { id } });
      }
      window.location.assign('/app');
    },
  });
  const settings = query.data;
  return (
    <div className="connection-recovery-computers">
      <h3>Your computers</h3>
      <p>Check each connection, or switch to another computer.</p>
      {query.isPending && <p className="connection-recovery-loading">Loading computers…</p>}
      {query.error && (
        <div className="connection-recovery-loading">
          <p role="alert">Could not load saved computers. {query.error.message}</p>
          <button
            type="button"
            className="settings-health-retry"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Try again
          </button>
        </div>
      )}
      {select.error && (
        <p className="error-banner" role="alert">
          Could not switch computers. {select.error.message}
        </p>
      )}
      {settings && (
        <ul className="computer-list">
          {settings.computers.map((computer) => (
            <ComputerConnectionRow
              key={computer.id}
              computer={computer}
              icon={settings?.computerIcons[computer.id]}
              selected={settings.activeId === computer.id}
              localName={settings.local?.host.name}
              localAddress={settings.local?.address}
              pending={select.isPending}
              onSelect={() => select.mutate(computer.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
