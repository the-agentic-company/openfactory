import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Copy, Laptop, Link2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { z } from 'zod';
import { Modal } from './modal';
import { WorkspacePage } from './workspace-page';
import * as connections from '../server/connections';
import '../connection-settings.css';

declare global {
  interface Window {
    openfactory?: {
      invoke: (operation: string, payload?: unknown) => Promise<unknown>;
      platform?: string;
      onPairingLink?: (callback: (link: string) => void) => void;
    };
  }
}
const settingsSchema = z.object({
  activeId: z.string().default('local'),
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
const pairingSchema = z.object({
  id: z.string(),
  code: z.string(),
  expiresAt: z.number(),
  origin: z.string(),
  link: z.string(),
});
const subscribeMounted = () => () => {};
const native = () => (typeof window === 'undefined' ? undefined : window.openfactory);
async function loadSettings() {
  const api = native();
  if (!api) {
    return settingsSchema.parse(await connections.getConnections());
  }
  const boot = z
    .object({ activeId: z.string().default('local'), computers: settingsSchema.shape.computers })
    .parse(await api.invoke('boot'));
  let local = null;
  try {
    local = await api.invoke('state', { computerId: 'local' });
  } catch {
    /* Settings remain available while the host restarts. */
  }
  return settingsSchema.parse({ ...boot, local });
}

export function ConnectionSettings() {
  const router = useRouter();
  const client = useQueryClient();
  const mounted = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );
  const [adding, setAdding] = useState(false);
  const [pairing, setPairing] = useState<z.infer<typeof pairingSchema> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (sessionStorage.getItem('openfactory-pairing-link')) {
      queueMicrotask(() => setAdding(true));
    }
  }, []);
  const query = useQuery({
    queryKey: ['connection-settings'],
    queryFn: loadSettings,
    enabled: mounted,
    refetchInterval: 10000,
  });
  const action = useMutation({
    mutationFn: async ({
      operation,
      id,
    }: {
      operation: 'select' | 'forget' | 'revoke' | 'pairing' | 'network' | 'restart' | 'login';
      id?: string;
    }) => {
      const api = native();
      if (operation === 'pairing') {
        setPairing(
          pairingSchema.parse(
            api
              ? await api.invoke('pairing', { computerId: 'local' })
              : await connections.createPairing(),
          ),
        );
      } else if (operation === 'select' && id) {
        if (api) {
          await api.invoke('select-computer', { id });
        } else {
          await connections.selectComputer({ data: { id } });
        }
        await client.invalidateQueries();
        await router.invalidate();
        setNotice('Computer selected. The workspace shows its factories and agents.');
      } else if (operation === 'forget' && id) {
        if (api) {
          await api.invoke('forget', { id });
        } else {
          await connections.forgetComputer({ data: { id } });
        }
      } else if (operation === 'revoke' && id) {
        if (api) {
          await api.invoke('revoke', { computerId: 'local', id });
        } else {
          await connections.revokeComputer({ data: { id } });
        }
      } else if (operation === 'network' && !api) {
        await connections.enableNetwork();
        setNotice('Private Tailscale access is enabled.');
      } else if (api) {
        await api.invoke(
          operation === 'network'
            ? 'enable-network'
            : operation === 'restart'
              ? 'restart-host'
              : 'start-at-login',
        );
        setNotice(
          operation === 'network'
            ? 'Private Tailscale access is enabled.'
            : operation === 'restart'
              ? 'The local host restarted.'
              : 'The host will start at login.',
        );
      }
      await query.refetch();
    },
  });
  async function closePairing() {
    const old = pairing;
    setPairing(null);
    if (!old) {
      return;
    }
    if (native()) {
      await native()?.invoke('cancel-pairing', { computerId: 'local', data: { id: old.id } });
    } else {
      await connections.cancelPairing({ data: { id: old.id } });
    }
  }
  const settings = query.data;
  return (
    <WorkspacePage contentClassName="connection-settings" title="Settings">
      <p className="muted-copy">Computers and access</p>
      {(action.error || query.error) && (
        <p className="error-banner" role="alert">
          {action.error?.message ?? query.error?.message}
        </p>
      )}
      {notice && <output className="settings-notice">{notice}</output>}
      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <h2>Computers</h2>
            <p>Choose where your factories and agents run.</p>
          </div>
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add computer
          </button>
        </div>
        {!settings && <p className="muted-copy">Loading computers…</p>}
        {settings?.computers.map((computer) => (
          <div className="settings-computer-row" key={computer.id}>
            <Laptop size={19} />
            <div className="settings-computer-description">
              <strong>{computer.name}</strong>
              <span>
                {computer.local ? (settings.local?.host.name ?? 'Local host') : computer.origin}
              </span>
            </div>
            {settings.activeId === computer.id ? (
              <span className="settings-selected">
                <ShieldCheck size={14} /> In use
              </span>
            ) : (
              <button
                className="button secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ operation: 'select', id: computer.id })}
              >
                Use computer
              </button>
            )}
            {!computer.local && (
              <button
                className="icon-button"
                aria-label={`Forget ${computer.name}`}
                disabled={action.isPending}
                onClick={() => action.mutate({ operation: 'forget', id: computer.id })}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <h2>Pair a device with this computer</h2>
            <p>Create a one-time link or code for another OpenFactory installation.</p>
          </div>
          <button
            className="button secondary"
            disabled={action.isPending || !settings?.local}
            onClick={() => action.mutate({ operation: 'pairing' })}
          >
            <Link2 size={15} /> Create pairing link
          </button>
        </div>
        <p className="settings-help">
          Both devices must be connected to Tailscale. Codes expire after five minutes. Only pair
          devices you trust to run agents here.
        </p>
        {settings?.local?.address && <p className="settings-address">{settings.local.address}</p>}
        <div className="settings-local-actions">
          <button
            className="button secondary"
            disabled={action.isPending || !settings?.local}
            onClick={() => action.mutate({ operation: 'network' })}
          >
            Enable Tailscale access
          </button>
          {mounted && native() && (
            <>
              <button
                className="button secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ operation: 'login' })}
              >
                Start host at login
              </button>
              <button
                className="button secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ operation: 'restart' })}
              >
                Restart host
              </button>
            </>
          )}
        </div>
      </section>
      <section className="settings-section">
        <h2>Devices with access</h2>
        {settings?.local?.peers.length ? (
          settings.local.peers.map((peer) => (
            <div className="settings-computer-row" key={peer.id}>
              <ShieldCheck size={17} />
              <div className="settings-computer-description">
                <strong>{peer.name}</strong>
                <span>Paired {new Date(peer.createdAt).toLocaleDateString()}</span>
              </div>
              <button
                className="button secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ operation: 'revoke', id: peer.id })}
              >
                Revoke access
              </button>
            </div>
          ))
        ) : (
          <p className="settings-help">No devices are paired with this computer yet.</p>
        )}
      </section>
      {adding && (
        <AddComputer
          onClose={() => setAdding(false)}
          onPaired={() => {
            setAdding(false);
            void query.refetch();
            setNotice('Computer paired. Choose “Use computer” to open its workspace.');
          }}
        />
      )}
      {pairing && (
        <PairingCode
          pairing={pairing}
          onClose={() => {
            void closePairing();
          }}
        />
      )}
    </WorkspacePage>
  );
}

function AddComputer({ onClose, onPaired }: { onClose: () => void; onPaired: () => void }) {
  const [link, setLink] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const api = native();
      if (api) {
        await api.invoke('pair', { address: address.trim(), code: code.trim() });
      } else {
        await connections.pairComputer({ data: { address: address.trim(), code: code.trim() } });
      }
    },
    onSuccess: onPaired,
  });
  function parseLink(value: string) {
    setLink(value);
    try {
      const url = new URL(value);
      if (url.protocol === 'openfactory:' && url.hostname === 'pair') {
        setAddress(url.searchParams.get('address') ?? '');
        setCode(decodeURIComponent(url.hash.slice(1)));
      }
    } catch {
      /* Incomplete links are allowed while typing. */
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }
  useEffect(() => {
    const incoming = sessionStorage.getItem('openfactory-pairing-link');
    if (incoming) {
      queueMicrotask(() => parseLink(incoming));
      sessionStorage.removeItem('openfactory-pairing-link');
    }
  }, []);
  return (
    <Modal titleId="pair-computer-title" onClose={onClose}>
      <div className="modal-heading">
        <button className="icon-button" aria-label="Close pairing" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="pair-computer-title">Add a computer</h2>
      <p>
        On the other computer, open Settings and create a pairing link. Paste it here, or enter its
        address and fresh code.
      </p>
      <form onSubmit={submit}>
        <label>
          Pairing link
          <input
            value={link}
            onChange={(event) => parseLink(event.target.value)}
            placeholder="openfactory://pair…"
            autoComplete="off"
          />
        </label>
        <label>
          Computer address
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="https://computer.tailnet.ts.net:8445"
            required
          />
        </label>
        <label>
          Pairing code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="1234 5678"
            autoComplete="off"
            required
          />
        </label>
        {mutation.error && (
          <p className="error-banner" role="alert">
            {mutation.error.message}
          </p>
        )}
        <button type="submit" className="button primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Pairing…' : 'Pair computer'}
        </button>
      </form>
    </Modal>
  );
}
function PairingCode({
  pairing,
  onClose,
}: {
  pairing: z.infer<typeof pairingSchema>;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = now >= pairing.expiresAt;
  async function copy() {
    if (native()) {
      await native()?.invoke('copy', pairing.link);
    } else {
      await navigator.clipboard.writeText(pairing.link);
    }
    setCopied(true);
  }
  return (
    <Modal titleId="pair-device-title" onClose={onClose}>
      <div className="modal-heading">
        <button className="icon-button" aria-label="Close pairing code" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="pair-device-title">Pair a device</h2>
      <p>Enter this code on your other computer. It works once.</p>
      {pairing.origin.startsWith('http:') && (
        <p className="error-banner">
          Enable Tailscale access in Settings before pairing a remote device.
        </p>
      )}
      <div className="settings-pairing-code">
        {pairing.code.slice(0, 4)} {pairing.code.slice(4)}
      </div>
      <p className="settings-address">{pairing.origin}</p>
      <output className="settings-help">
        {expired
          ? 'This code expired. Close this dialog and create a new pairing link.'
          : `Expires in ${Math.ceil((pairing.expiresAt - now) / 60000)} minutes`}
      </output>
      <button
        className="button primary"
        onClick={() => {
          void copy();
        }}
        disabled={expired}
      >
        <Copy size={15} /> {copied ? 'Copied' : 'Copy pairing link'}
      </button>
    </Modal>
  );
}
