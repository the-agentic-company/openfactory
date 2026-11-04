import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { checkConnection, connectionHealthSchema } from '../connection-health';
import { computerIconSchema } from '../computer-workspaces';
import { ComputerIconPicker } from './computer-icon';
import * as connections from '../server/connections';
import '../connection-settings.css';

declare global {
  interface Window {
    openfactory?: {
      invoke: (operation: string, payload?: unknown) => Promise<unknown>;
      platform?: string;
      onUpdate?: (callback: (state: unknown) => void) => () => void;
      onPairingLink?: (callback: (link: string) => void) => void;
    };
  }
}
export const settingsSchema = z.object({
  activeId: z.string().default('local'),
  computerIcons: z.record(z.string(), computerIconSchema).default({}),
  computers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      local: z.boolean(),
      origin: z.string().nullish(),
    }),
  ),
  local: z
    .object({
      host: z.object({ name: z.string() }),
      address: z.string().nullable(),
      peers: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })),
    })
    .nullable(),
});

export const native = () => (typeof window === 'undefined' ? undefined : window.openfactory);
export async function loadSettings() {
  const api = native();
  if (!api) {
    return settingsSchema.parse(await connections.getConnections());
  }
  const boot = z
    .object({
      activeId: z.string().default('local'),
      computerIcons: settingsSchema.shape.computerIcons,
      computers: settingsSchema.shape.computers,
    })
    .parse(await api.invoke('boot'));
  let local = null;
  try {
    local = await api.invoke('state', { computerId: 'local' });
  } catch {
    /* Settings remain available while the host restarts. */
  }
  return settingsSchema.parse({ ...boot, local });
}

const checkTimeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

function connectionStatus(health: z.infer<typeof connectionHealthSchema>) {
  switch (health.kind) {
    case 'reachable':
      return 'Factories available';
    case 'timeout':
      return 'Connection timed out';
    case 'access-denied':
      return 'Access denied';
    case 'error':
      return 'Factory access failed';
    case 'unreachable':
      if (/ENOTFOUND|\bDNS\b/i.test(health.detail)) {
        return 'Computer address not found';
      }
      if (/ECONNREFUSED/i.test(health.detail)) {
        return 'OpenFactory is not accepting connections';
      }
      return 'Cannot reach OpenFactory';
  }
}

export function ComputerHealth({
  computer,
}: {
  computer: z.infer<typeof settingsSchema>['computers'][number];
}) {
  const health = useQuery({
    queryKey: ['computer-health', computer.id, computer.origin],
    queryFn: async () => {
      const api = native();
      const health = api
        ? await checkConnection(
            () => api.invoke('workspace-summary', { computerId: computer.id }),
            computer.local,
          )
        : connectionHealthSchema.parse(
            await connections.checkComputer({ data: { id: computer.id } }),
          );
      return { ...health, checkedAtLabel: checkTimeFormatter.format(health.checkedAt) };
    },
    refetchInterval: 10000,
    retry: false,
  });
  const result = health.data;
  let status = 'Status unavailable';
  if (health.isFetching && !result) {
    status = 'Checking connection…';
  } else if (result && !health.error) {
    status = connectionStatus(result);
  }
  return (
    <div className="settings-computer-health">
      <div className="settings-health-summary">
        <output
          className={`settings-health-status settings-health-status--${health.error ? 'unknown' : (result?.kind ?? 'unknown')}`}
        >
          {status}
        </output>
        <button
          className="settings-health-retry"
          disabled={health.isFetching}
          onClick={() => {
            void health.refetch();
          }}
          aria-label={`Check connection to ${computer.name}`}
        >
          Check again
        </button>
      </div>
      {result && (
        <details>
          <summary>Connection details</summary>
          <span className="settings-health-timestamp">
            Last checked {result.checkedAtLabel}
            {result.kind === 'reachable' ? ` · ${result.latencyMs} ms response` : ''}
            {' · Refreshes every 10 seconds'}
          </span>
        </details>
      )}
      {result && result.kind !== 'reachable' && (
        <div className="settings-health-problem">
          <p>
            {result.kind === 'timeout' && 'OpenFactory did not respond. '}
            {result.recommendation.replace('the selected computer', 'this computer')}
          </p>
          <p>{result.detail}</p>
        </div>
      )}
      {health.error && (
        <p className="settings-health-problem" role="alert">
          Could not refresh connection status. {health.error.message} Check again when the app is
          responding.
        </p>
      )}
    </div>
  );
}

export function ComputerConnectionRow({
  computer,
  selected,
  localName,
  localAddress,
  pending,
  onSelect,
  children,
  icon,
  selectedLabel = 'Workspace open',
  selectLabel = 'Open workspace',
  detail,
}: {
  computer: z.infer<typeof settingsSchema>['computers'][number];
  selected: boolean;
  selectedLabel?: string;
  selectLabel?: string;
  detail?: ReactNode;
  localName?: string;
  localAddress?: string | null;
  pending: boolean;
  onSelect: () => void;
  children?: ReactNode;
  icon?: z.infer<typeof computerIconSchema>;
}) {
  return (
    <li className="settings-computer-row">
      <ComputerIconPicker id={computer.id} name={computer.name} icon={icon} />
      <div className="settings-computer-description">
        <div className="settings-computer-name">
          <strong>{computer.local ? (localName ?? computer.name) : computer.name}</strong>
          {selected && (
            <span className="settings-selected">
              <ShieldCheck size={14} /> {selectedLabel}
            </span>
          )}
        </div>
        <span className="settings-computer-address">
          {computer.local
            ? (localAddress ?? computer.origin ?? 'Local connection on this computer')
            : (computer.origin ?? 'No address saved')}
        </span>
        {detail}
        <ComputerHealth computer={computer} />
      </div>
      <div className="settings-computer-actions">
        {!selected && (
          <button type="button" className="button secondary" disabled={pending} onClick={onSelect}>
            {selectLabel}
          </button>
        )}
        {children}
      </div>
    </li>
  );
}
