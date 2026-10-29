import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  session,
} from 'electron';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { defaultDataDir, validateOrigin } from './host.mjs';
import { stateSchema } from './contracts.mjs';
import { syncPullInputSchema, validateSyncBatch } from './sync-contracts.mjs';
import { watchHostChanges } from './sync-transport.mjs';
import { installBackgroundService, startBackgroundService } from './background.mjs';
import { startWorkspaceServices } from './workspace-services.mjs';

const exec = promisify(execFile);
if (process.platform === 'darwin') {
  nativeTheme.themeSource = 'dark';
  process.env.PATH = [
    join(homedir(), '.local/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH ?? '/usr/bin:/bin',
  ].join(':');
}
const root = dirname(fileURLToPath(import.meta.url));
const dataDir = defaultDataDir();
const registryPath = join(dataDir, 'computers.json');
const syncConnections = new Map();
const own = { id: 'local', name: 'This computer', local: true };
let local;
let window;
let workspace;
let activeComputerId = 'local';
let pendingPairing = process.argv.find((arg) => arg.startsWith('openfactory://pair')) ?? null;
let computers = [];
const peerSchema = z.object({
  host: z.object({ id: z.uuid(), name: z.string(), version: z.literal(1) }),
  token: z.string().min(32),
  peerId: z.uuid(),
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, args) => {
    const pairingLink = args.find((arg) => arg.startsWith('openfactory://pair?'));
    if (pairingLink) {
      pendingPairing = pairingLink;
    }
    if (!window) {
      createWindow();
    }
    window?.show();
    window?.focus();
    if (pairingLink) {
      window?.webContents.send('pairing-link', pairingLink);
    }
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    pendingPairing = url;
    window?.webContents.send('pairing-link', url);
  });
  void app.whenReady().then(async () => {
    try {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      try {
        computers = z
          .array(
            z.object({
              id: z.uuid(),
              hostId: z.uuid(),
              name: z.string(),
              origin: z.string(),
              secret: z.string(),
              encrypted: z.boolean(),
              peerId: z.uuid(),
            }),
          )
          .parse(JSON.parse(readFileSync(registryPath, 'utf8')));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new Error(
            'The saved computer list could not be read. Restore computers.json from a backup before continuing.',
          );
        }
      }
      local = await ensureHost();
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      ipcMain.handle('openfactory', async (event, operation, payload) => {
        if (
          !workspace ||
          new URL(event.senderFrame?.url ?? 'about:blank').origin !== workspace.origin
        ) {
          throw new Error('Unknown app window.');
        }
        return operate(operation, payload);
      });
      let selectedTarget = local;
      try {
        const saved = readFileSync(join(dataDir, 'active-computer'), 'utf8').trim();
        if (computers.some((computer) => computer.id === saved)) {
          selectedTarget = connection(saved);
          activeComputerId = saved;
        }
      } catch {
        /* A missing selection or locked keyring starts with this computer. */
      }
      workspace = await startWorkspaceServices({
        root,
        dataDir,
        target: selectedTarget,
        development: !app.isPackaged && process.env.OPENFACTORY_DESKTOP_DEV === '1',
      });
      if (app.isPackaged && !process.env.OPENFACTORY_DESKTOP_HOME) {
        app.setAsDefaultProtocolClient('openfactory');
      }
      if (process.argv.includes('--background')) {
        app.quit();
      } else {
        createWindow();
      }
      app.on('activate', () => {
        if (!window) {
          createWindow();
        }
      });
    } catch (error) {
      dialog.showErrorBox('OpenFactory could not start', error.message);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => workspace?.close());

function createWindow() {
  if (!workspace) {
    return;
  }
  window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 760,
    minHeight: 580,
    title: 'OpenFactory',
    backgroundColor: '#0c0d11',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
    icon: join(root, 'ui/logo.png'),
    webPreferences: {
      preload: join(root, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!workspace || new URL(url).origin !== workspace.origin) {
      event.preventDefault();
    }
  });
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) {
      stopSyncConnections();
    }
  });
  window.on('closed', () => {
    stopSyncConnections();
    window = null;
  });
  if (workspace) {
    void window.loadURL(`${workspace.origin}/app`);
  }
}

function persistComputers() {
  writeFileSync(`${registryPath}.tmp`, JSON.stringify(computers, null, 2), { mode: 0o600 });
  renameSync(`${registryPath}.tmp`, registryPath);
}

function encodeSecret(token) {
  const encrypted =
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  return {
    encrypted,
    secret: encrypted ? safeStorage.encryptString(token).toString('base64') : token,
  };
}

function connection(id) {
  if (id === 'local') {
    return local;
  }
  const computer = computers.find((entry) => entry.id === id);
  if (!computer) {
    throw new Error('Choose a saved computer.');
  }
  let token;
  try {
    token = computer.encrypted
      ? safeStorage.decryptString(Buffer.from(computer.secret, 'base64'))
      : computer.secret;
  } catch {
    throw new Error('Unlock your system keyring, or forget this computer and pair it again.');
  }
  return { origin: validateOrigin(computer.origin), token, hostId: computer.hostId };
}

async function request(target, path, method = 'GET', payload) {
  let response;
  try {
    response = await fetch(`${target.origin}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Bearer ${target.token}`,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  } catch {
    throw new Error(
      'Computer unavailable. Check that it is awake, OpenFactory is running, and Tailscale is connected.',
    );
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? 'OpenFactory rejected this request.');
  }
  if (
    (path === '/v1/state' && result.host?.id !== target.hostId) ||
    (path === '/v1/identity' && result.id !== target.hostId)
  ) {
    throw new Error('This address belongs to a different computer. Forget it and pair again.');
  }
  if (path === '/v1/state') {
    return stateSchema.parse(result);
  }
  return result;
}

function readLocalConnection() {
  const saved = JSON.parse(readFileSync(join(dataDir, 'connection.json'), 'utf8'));
  return {
    origin: validateOrigin(saved.origin),
    token: readFileSync(join(dataDir, 'owner-token'), 'utf8').trim(),
    hostId: z.uuid().parse(saved.hostId),
  };
}

function stopSyncConnections(id) {
  for (const [computerId, controller] of syncConnections) {
    if (id === undefined || computerId === id) {
      controller.abort();
      syncConnections.delete(computerId);
    }
  }
}

async function ensureHost() {
  const load = async () => {
    const target = readLocalConnection();
    await request(target, '/v1/identity');
    return target;
  };
  try {
    const target = await load();
    const identity = await request(target, '/v1/identity');
    if (identity.workspaceProtocol === 1) {
      return target;
    }
    const state = await request(target, '/v1/state');
    if (state.runs.some((run) => ['running', 'queued'].includes(run.status))) {
      throw Object.assign(
        new Error('Finish or cancel runs in the previous prototype before opening this update.'),
        { code: 'ACTIVE_PREVIOUS_HOST' },
      );
    }
    await request(target, '/v1/shutdown', 'POST', {});
    await new Promise((accept) => setTimeout(accept, 300));
    throw new Error('Restarting the previous host with this app version.');
  } catch (error) {
    if (error.code === 'ACTIVE_PREVIOUS_HOST') {
      throw error;
    }
    if (app.isPackaged && process.platform === 'linux' && !process.env.OPENFACTORY_DESKTOP_HOME) {
      try {
        await installBackgroundService({
          executable: process.execPath,
          hostScript: join(root, 'host.mjs'),
          dataDir,
        });
        await startBackgroundService();
        return await load();
      } catch {
        // Desktops without a user systemd session still get an independent host process.
      }
    }
    const log = openSync(join(dataDir, 'host.log'), 'a', 0o600);
    const child = spawn(process.execPath, [join(root, 'host.mjs')], {
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        OPENFACTORY_DESKTOP_HOME: dataDir,
        PATH: `${join(homedir(), '.local/bin')}:${process.env.PATH ?? ''}`,
      },
    });
    child.unref();
    closeSync(log);
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((accept) => setTimeout(accept, 200));
      try {
        return await load();
      } catch {
        // The connection file is published only after the listener is ready.
      }
    }
    throw new Error(`The background host could not start. See ${join(dataDir, 'host.log')}.`);
  }
}

async function operate(operation, raw = {}) {
  if (operation === 'select-computer') {
    const { id } = z.object({ id: z.string() }).parse(raw);
    const target = connection(id);
    await request(target, '/v1/state');
    await workspace.select(target);
    activeComputerId = id;
    writeFileSync(join(dataDir, 'active-computer'), id, { mode: 0o600 });
    return true;
  }
  if (operation === 'boot') {
    return {
      activeId: activeComputerId,
      computers: [
        { ...own, hostId: local.hostId },
        ...computers.map(({ id, hostId, name, origin }) => ({
          id,
          hostId,
          name,
          origin,
          local: false,
        })),
      ],
      pairingLink: pendingPairing,
      platform: process.platform,
    };
  }
  if (operation === 'copy') {
    await clipboard.writeText(z.string().max(10000).parse(raw));
    return true;
  }
  if (operation === 'choose-folder') {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  }
  if (operation === 'restart-host') {
    const state = await request(local, '/v1/state');
    if (state.runs.some((run) => ['running', 'queued'].includes(run.status))) {
      throw new Error('Wait for active runs to finish or cancel them before restarting this host.');
    }
    await request(local, '/v1/shutdown', 'POST', {});
    await new Promise((accept) => setTimeout(accept, 300));
    stopSyncConnections('local');
    local = await ensureHost();
    return true;
  }
  if (operation === 'forget') {
    const id = z.uuid().parse(raw.id);
    stopSyncConnections(id);
    computers = computers.filter((entry) => entry.id !== id);
    persistComputers();
    return true;
  }
  if (operation === 'pair') {
    const input = z.object({ address: z.string(), code: z.string() }).parse(raw);
    const origin = validateOrigin(input.address);
    const result = peerSchema.parse(
      await request({ origin, token: '' }, '/v1/pair', 'POST', {
        code: input.code,
        name: hostname(),
      }),
    );
    if (result.host.id === local.hostId) {
      await request(local, `/v1/peers/${result.peerId}`, 'DELETE');
      throw new Error('This is already your local computer. Choose a different computer to pair.');
    }
    const existing = computers.find((entry) => entry.hostId === result.host.id);
    const saved = {
      id: existing?.id ?? randomUUID(),
      hostId: result.host.id,
      name: result.host.name,
      origin,
      peerId: result.peerId,
      ...encodeSecret(result.token),
    };
    computers = [...computers.filter((entry) => entry.hostId !== saved.hostId), saved];
    persistComputers();
    pendingPairing = null;
    return saved.id;
  }
  if (operation === 'enable-network') {
    let result;
    try {
      result = await exec('tailscale', ['status', '--json'], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
    } catch {
      throw new Error('Install Tailscale and sign in on this computer, then try again.');
    }
    const status = JSON.parse(result.stdout);
    if (status.BackendState !== 'Running' || !status.Self?.DNSName) {
      throw new Error('Connect this computer to Tailscale, then try again.');
    }
    const existing = JSON.parse(
      (await exec('tailscale', ['serve', 'status', '--json'], { timeout: 10000 })).stdout,
    );
    const hostname = status.Self.DNSName.replace(/\.$/, '');
    const mapped = existing.Web?.[`${hostname}:8445`]?.Handlers?.['/']?.Proxy;
    if (existing.TCP?.['8445'] && mapped !== local.origin) {
      throw new Error(
        'Tailscale port 8445 already belongs to another service. Free that port before enabling OpenFactory access.',
      );
    }
    try {
      await exec('tailscale', ['serve', '--bg', '--https=8445', local.origin], { timeout: 15000 });
    } catch {
      throw new Error(
        'Tailscale could not enable HTTPS. Run “tailscale serve --bg --https=8445 ' +
          local.origin +
          '” in a terminal to complete its setup, then try again.',
      );
    }
    const address = `https://${status.Self.DNSName.replace(/\.$/, '')}:8445`;
    return request(local, '/v1/network', 'POST', { address });
  }
  if (operation === 'start-at-login') {
    if (process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--background'] });
      return true;
    }
    if (process.env.APPIMAGE) {
      throw new Error(
        'Install the .deb package or extracted archive first so the host has a permanent location.',
      );
    }
    try {
      await installBackgroundService({
        executable: process.execPath,
        hostScript: join(root, 'host.mjs'),
        dataDir,
        port: Number(new URL(local.origin).port),
      });
      return true;
    } catch {
      // Fall back to a desktop login entry when systemd is unavailable.
    }
    const directory = join(homedir(), '.config/autostart');
    mkdirSync(directory, { recursive: true });
    const quote = (value) =>
      `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$').replaceAll('%', '%%')}"`;
    const command = app.isPackaged
      ? quote(process.execPath)
      : `${quote(process.execPath)} ${quote(dirname(root))}`;
    writeFileSync(
      join(directory, 'openfactory-prototype.desktop'),
      `[Desktop Entry]\nType=Application\nName=OpenFactory background host\nExec=${command} --background\nTerminal=false\n`,
      { mode: 0o600 },
    );
    return true;
  }
  const input = z
    .object({ computerId: z.string(), data: z.unknown().optional(), id: z.uuid().optional() })
    .parse(raw);
  const target = connection(input.computerId);
  if (operation === 'sync-start') {
    stopSyncConnections(input.computerId);
    const controller = new AbortController();
    syncConnections.set(input.computerId, controller);
    const emit = (update) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('sync-change', {
          computerId: input.computerId,
          hostId: target.hostId,
          ...update,
        });
      }
    };
    void watchHostChanges(target, {
      signal: controller.signal,
      onChange: () => emit({ status: 'changed' }),
      onStatus: emit,
    });
    return true;
  }
  if (operation === 'sync-pull') {
    const options = syncPullInputSchema.parse(input.data);
    if (options.checkpoint && options.checkpoint.hostId !== target.hostId) {
      throw new Error('The saved checkpoint belongs to a different computer.');
    }
    return validateSyncBatch(
      await request(
        target,
        `/v1/sync?after=${options.checkpoint?.sequence ?? 0}&limit=${options.batchSize}`,
      ),
      target.hostId,
    );
  }
  if (operation === 'state') {
    return request(target, '/v1/state');
  }
  if (operation === 'create-factory') {
    return request(target, '/v1/factories', 'POST', input.data);
  }
  if (operation === 'create-agent') {
    return request(target, '/v1/agents', 'POST', input.data);
  }
  if (operation === 'run' && input.id) {
    return request(target, `/v1/agents/${input.id}/run`, 'POST', {});
  }
  if (operation === 'schedule' && input.id) {
    return request(target, `/v1/agents/${input.id}/schedule`, 'POST', input.data);
  }
  if (operation === 'cancel' && input.id) {
    return request(target, `/v1/runs/${input.id}/cancel`, 'POST', {});
  }
  if (operation === 'revoke' && input.id && input.computerId === 'local') {
    return request(target, `/v1/peers/${input.id}`, 'DELETE');
  }
  if (operation === 'pairing' && input.computerId === 'local') {
    const result = await request(local, '/v1/pairing', 'POST', {});
    const url = new URL('openfactory://pair');
    url.searchParams.set('address', result.origin);
    url.hash = result.code;
    return {
      ...result,
      link: url.href,
      qr: await QRCode.toDataURL(url.href, { width: 220, margin: 2, errorCorrectionLevel: 'M' }),
    };
  }
  if (operation === 'cancel-pairing' && input.computerId === 'local') {
    return request(local, '/v1/pairing', 'DELETE', input.data);
  }
  throw new Error('Unknown OpenFactory action.');
}
