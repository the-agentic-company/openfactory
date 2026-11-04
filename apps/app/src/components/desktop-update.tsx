import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import './desktop-update.css';

const updateStateSchema = z.object({
  status: z.enum([
    'idle',
    'disabled',
    'checking',
    'up-to-date',
    'available',
    'downloading',
    'downloaded',
    'installing',
    'error',
  ]),
  currentVersion: z.string(),
  installation: z.enum(['manual', 'restart']),
  version: z.string().nullable(),
  percent: z.number().nullable(),
  message: z.string().nullable(),
});
type UpdateState = z.infer<typeof updateStateSchema>;

export function DesktopUpdate() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const api = window.openfactory;
    if (!api?.onUpdate) {
      return;
    }
    const receive = (value: unknown) => {
      setState(updateStateSchema.parse(value));
      setError('');
    };
    const unsubscribe = api.onUpdate(receive);
    let mounted = true;
    void api.invoke('updates:state').then(
      (value) => {
        if (mounted) {
          receive(value);
        }
      },
      (failure: unknown) => {
        if (mounted) {
          setError(String(failure));
        }
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  if (!state || state.status === 'disabled') {
    return null;
  }
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const label =
    state.status === 'available'
      ? 'Download new version'
      : state.status === 'downloading'
        ? `Downloading ${Math.floor(state.percent ?? 0)}%`
        : state.status === 'downloaded'
          ? state.installation === 'manual'
            ? 'Open update installer'
            : 'Restart to update'
          : state.status === 'installing'
            ? state.installation === 'manual'
              ? 'Opening installer…'
              : 'Restarting…'
            : state.status === 'checking'
              ? 'Checking for updates…'
              : state.status === 'error'
                ? 'Retry update check'
                : 'Check for updates';
  async function act() {
    const api = window.openfactory;
    if (!api || !state) {
      return;
    }
    setError('');
    try {
      const operation =
        state.status === 'available'
          ? 'download'
          : state.status === 'downloaded'
            ? 'install'
            : 'check';
      setState(updateStateSchema.parse(await api.invoke(`updates:${operation}`)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <div className="desktop-update">
      <button
        type="button"
        className={`nav-link desktop-update-button ${state.version ? 'desktop-update-available' : ''}`}
        disabled={busy}
        onClick={() => void act()}
        title={
          state.version ? `OpenFactory ${state.version}` : `OpenFactory ${state.currentVersion}`
        }
      >
        {state.status === 'downloaded' ? <RefreshCw size={17} /> : <Download size={17} />}
        <span>{label}</span>
      </button>
      {state.status === 'downloading' && (
        <progress aria-label="Update download" value={state.percent ?? 0} max={100} />
      )}
      {state.version && <p className="desktop-update-version">Version {state.version}</p>}
      {state.status === 'up-to-date' && <output>You’re up to date.</output>}
      {state.status === 'downloaded' && state.installation === 'manual' && (
        <p>Quit OpenFactory, then replace it in Applications with the downloaded app.</p>
      )}
      {(error || state.message) && <p role="alert">{error || state.message}</p>}
    </div>
  );
}
