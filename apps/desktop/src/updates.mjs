import { EventEmitter } from 'node:events';

export function createDesktopUpdates({
  updater,
  version,
  enabled,
  disabledReason = 'Updates are available in an installed AppImage, Debian package, Mac app, or Windows installer.',
  feedUrl,
  openInstaller,
  pollInterval = 60 * 60 * 1000,
}) {
  const events = new EventEmitter();
  const installation = openInstaller ? 'manual' : 'restart';
  let state = {
    status: enabled ? 'idle' : 'disabled',
    currentVersion: version,
    installation,
    version: null,
    percent: null,
    message: enabled ? null : disabledReason,
  };
  let downloadedFile;
  let busy = false;
  const listeners = [];
  const set = (patch) => {
    state = { ...state, ...patch };
    events.emit('change', state);
  };
  const listen = (name, callback) => {
    updater.on(name, callback);
    listeners.push([name, callback]);
  };
  const fail = (error) => {
    set({
      status: downloadedFile ? 'downloaded' : state.version ? 'available' : 'error',
      message: error.message,
      percent: downloadedFile ? 100 : null,
    });
  };
  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    if (feedUrl) {
      updater.setFeedURL({ provider: 'generic', url: feedUrl });
    }
    listen('error', fail);
    listen('update-available', (info) => {
      set({ status: 'available', version: info.version, message: null });
    });
    listen('update-not-available', () => {
      if (!downloadedFile) {
        set({ status: 'up-to-date', version: null, percent: null, message: null });
      }
    });
    listen('download-progress', ({ percent }) => {
      set({ status: 'downloading', percent: Math.max(0, Math.min(100, percent)) });
    });
    listen('update-downloaded', (info) => {
      downloadedFile = info.downloadedFile;
      set({ status: 'downloaded', version: info.version, percent: 100, message: null });
    });
  }
  async function run(operation) {
    if (!enabled || busy || state.status === 'installing') {
      return state;
    }
    busy = true;
    try {
      await operation();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
    return state;
  }
  async function check() {
    if (downloadedFile || state.status === 'downloading') {
      return state;
    }
    return run(async () => {
      set({ status: 'checking', message: null });
      await updater.checkForUpdates();
    });
  }
  const timer = enabled ? setInterval(() => void check(), pollInterval) : undefined;
  timer?.unref();
  return {
    getState: () => state,
    subscribe(callback) {
      events.on('change', callback);
      return () => events.off('change', callback);
    },
    check,
    download() {
      if (state.status !== 'available') {
        return Promise.resolve(state);
      }
      return run(async () => {
        set({ status: 'downloading', percent: 0, message: null });
        await updater.downloadUpdate();
      });
    },
    install() {
      if (state.status !== 'downloaded') {
        return Promise.resolve(state);
      }
      return run(async () => {
        set({ status: 'installing', message: null });
        if (openInstaller) {
          const error = await openInstaller(downloadedFile);
          if (error) {
            throw new Error(error);
          }
          set({ status: 'downloaded' });
        } else {
          updater.quitAndInstall(false, true);
        }
      });
    },
    dispose() {
      clearInterval(timer);
      for (const [name, callback] of listeners) {
        updater.off(name, callback);
      }
      events.removeAllListeners();
    },
  };
}
