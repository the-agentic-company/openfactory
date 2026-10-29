import { openClientCache } from './client-cache.js';

const api = window.openfactory;
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const content = document.querySelector('#dialog-content');
const toast = document.querySelector('#toast');
let computers = [];
let selected = 'local';
let page = 'workspace';
let tab = 'agents';
let factoryId = null;
let snapshots = new Map();
let errors = new Map();
let fingerprint = '';
let cache;
const subscriptions = new Map();
const connected = new Set();
const revoked = new Set();
let inspectedRunId = null;
let toastTimeout;

const escape = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const invoke = (operation, data, id) => {
  if (!connected.has(selected)) {
    throw new Error('Reconnect to this computer before making changes.');
  }
  return api.invoke(operation, { computerId: selected, data, ...(id ? { id } : {}) });
};
const button = (action, label, primary = false, extra = '') =>
  `<button class="button ${primary ? 'primary' : ''}" data-action="${action}" ${extra}>${label}</button>`;
const friendlyTime = (time) =>
  time
    ? new Date(time).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const busy = (agent, state) =>
  state.runs.some((run) => run.agentId === agent.id && ['queued', 'running'].includes(run.status));
const agentCount = (count) => `${count} ${count === 1 ? 'agent' : 'agents'}`;

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 7000);
}

async function boot() {
  const result = await api.invoke('boot');
  document.documentElement.classList.toggle('mac', result.platform === 'darwin');
  computers = result.computers;
  cache = await openClientCache();
  for (const computer of computers) {
    const saved = await cache.snapshot(computer.hostId);
    if (saved) {
      snapshots.set(computer.id, saved);
    }
  }
  render();
  await refresh();
  if (result.pairingLink) {
    showAddComputer(result.pairingLink);
  }
}

api.onSync(async ({ computerId, hostId, status, message }) => {
  if (!computers.some((computer) => computer.id === computerId && computer.hostId === hostId)) {
    return;
  }
  if (status === 'connected') {
    connected.add(computerId);
    errors.delete(computerId);
    cache.resync(hostId);
  } else if (status === 'changed') {
    cache.resync(hostId);
  } else {
    connected.delete(computerId);
    errors.set(computerId, message ?? 'Computer unavailable. Showing saved data.');
    if (status === 'revoked') {
      if (computerId === selected && dialog.open) {
        dialog.close();
      }
      revoked.add(computerId);
      subscriptions.get(computerId)?.unsubscribe();
      subscriptions.delete(computerId);
      snapshots.delete(computerId);
      await cache.forget(hostId);
    }
  }
  renderIfChanged();
});

async function refresh() {
  for (const computer of computers) {
    if (revoked.has(computer.id)) {
      continue;
    }
    if (!subscriptions.has(computer.id)) {
      subscriptions.set(
        computer.id,
        cache.observe(computer.hostId, (state) => {
          if (state) {
            snapshots.set(computer.id, state);
          } else {
            snapshots.delete(computer.id);
          }
          renderIfChanged();
        }),
      );
      cache.replicate(
        computer.hostId,
        (checkpoint, batchSize) =>
          api.invoke('sync-pull', { computerId: computer.id, data: { checkpoint, batchSize } }),
        () => {
          connected.delete(computer.id);
          errors.set(computer.id, 'Could not synchronize. Showing saved data while reconnecting.');
          renderIfChanged();
        },
        () => {
          if (revoked.has(computer.id)) {
            return;
          }
          connected.add(computer.id);
          errors.delete(computer.id);
          renderIfChanged();
        },
      );
      await api.invoke('sync-start', { computerId: computer.id });
    } else {
      cache.resync(computer.hostId);
    }
  }
}

function renderIfChanged() {
  const next = JSON.stringify([
    selected,
    page,
    tab,
    factoryId,
    [...snapshots],
    [...errors],
    [...connected],
    computers,
  ]);
  if (next !== fingerprint) {
    fingerprint = next;
    render();
    if (dialog.open && inspectedRunId) {
      inspectRun(inspectedRunId);
    }
  }
}

function render() {
  document.querySelector('#computers').innerHTML = computers
    .map(
      (computer) => `
    <button class="computer-button ${selected === computer.id && page === 'workspace' ? 'active' : ''}" data-computer="${computer.id}" ${selected === computer.id ? 'aria-current="page"' : ''}>
      <span class="dot ${errors.has(computer.id) ? 'offline' : snapshots.has(computer.id) ? 'online' : ''}"></span>
      <span class="name">${escape(computer.name)}<small>${computer.local ? 'Local host' : errors.has(computer.id) ? 'Unavailable' : 'Paired computer'}</small></span>
    </button>`,
    )
    .join('');
  if (page === 'computers') {
    renderComputers();
    return;
  }
  const computer = computers.find((entry) => entry.id === selected);
  const state = snapshots.get(selected);
  const unavailable = errors.get(selected);
  const usable = connected.has(selected);
  main.innerHTML = `<div class="topline"><div><h1>${escape(computer.name)}</h1><div class="subline"><span class="dot ${usable ? 'online' : 'offline'}"></span>${usable && state ? `Connected · ${escape(state.host.name)}` : unavailable ? 'Unavailable' : state ? 'Showing saved data · reconnecting…' : 'Connecting…'}</div></div>
    <div class="actions">${selected === 'local' ? button('share', 'Pair a device') : button('manage', 'Connection settings')}</div></div>
    ${unavailable ? `<div class="notice"><p>${escape(unavailable)}</p><div class="actions">${button('retry', 'Try again')}${button('manage', 'Manage computers')}</div></div>` : ''}
    ${state ? workspace(state) : '<p class="muted">Your factories will appear when the computer connects.</p>'}`;
  if (!usable) {
    main
      .querySelectorAll(
        '[data-action="new-factory"], [data-action="new-agent"], [data-action="run"], [data-action="schedule"]',
      )
      .forEach((button) => {
        button.disabled = true;
      });
  }
}

function workspace(state) {
  const factory = state.factories.find((entry) => entry.id === factoryId);
  if (!factory) {
    factoryId = state.factories[0]?.id ?? null;
  }
  const agents = state.agents.filter((entry) => entry.factoryId === factoryId);
  const runs = state.runs.filter((entry) => entry.factoryId === factoryId);
  return `${!state.provider.ready ? `<div class="notice"><p>Codex isn’t ready on this computer. Install the Codex CLI, sign in, then restart the OpenFactory host to run agents.</p></div>` : ''}
    <div class="status-strip"><span><strong>OpenFactory host</strong> ${connected.has(selected) ? 'running in the background' : 'saved data on this device'}</span><span><strong>Codex CLI</strong> ${state.provider.ready ? 'ready' : 'not installed'}</span><span><strong>${state.factories.length}</strong> ${state.factories.length === 1 ? 'factory' : 'factories'}</span></div>
    <section class="section"><div class="section-heading"><h2>Factories</h2>${button('new-factory', 'Add factory')}</div>
      ${state.factories.length ? state.factories.map((entry) => `<div class="factory-row ${factoryId === entry.id ? 'active' : ''}"><button class="select-factory" data-factory="${entry.id}"><h3>${escape(entry.name)}</h3><div class="path">${escape(entry.directory)}</div></button><span class="muted">${agentCount(state.agents.filter((agent) => agent.factoryId === entry.id).length)}</span></div>`).join('') : `<div class="empty"><h3>Start with a folder on this computer.</h3><p>A factory groups the agents working in that folder. Create one, give an agent its instructions, and try your first run.</p>${button('new-factory', 'Create your first factory', true)}</div>`}
    </section>
    ${
      factoryId
        ? `<div class="tabs" role="tablist" aria-label="Factory activity"><button role="tab" aria-selected="${tab === 'agents'}" class="${tab === 'agents' ? 'active' : ''}" data-tab="agents">Agents · ${agents.length}</button><button role="tab" aria-selected="${tab === 'runs'}" class="${tab === 'runs' ? 'active' : ''}" data-tab="runs">Runs · ${runs.length}</button></div>
      <section class="section" role="tabpanel">${
        tab === 'agents'
          ? `<div class="section-heading"><h2>Agents</h2>${button('new-agent', 'Create agent', true)}</div>
      ${agents.length ? agents.map((agent) => `<div class="agent-row"><div><h3>${escape(agent.name)}</h3><p class="prompt">${escape(agent.prompt)}</p><p>${agent.sandbox === 'read-only' ? 'Read-only access' : 'Can edit factory files'}</p></div><div class="schedule">${agent.intervalMinutes ? `Every ${agent.intervalMinutes} min · ${agent.enabled ? 'Enabled' : 'Paused'}` : 'Manual runs'}${agent.enabled ? `<br>Next: ${friendlyTime(agent.nextRunAt)}` : ''}</div><div class="actions">${agent.intervalMinutes ? button('schedule', agent.enabled ? 'Pause' : 'Enable', false, `data-id="${agent.id}" data-enabled="${!agent.enabled}"`) : ''}${button('run', busy(agent, state) ? 'In progress' : 'Run now', false, `data-id="${agent.id}" ${busy(agent, state) || !state.provider.ready ? 'disabled' : ''}`)}</div></div>`).join('') : `<div class="empty"><h3>What should your first agent do?</h3><p>Start with a small task such as reviewing a folder or summarizing recent changes. New schedules stay paused until you enable them.</p></div>`}`
          : `<div class="section-heading"><h2>Recent runs</h2><span class="muted">Saved on this computer</span></div>${runs.length ? runs.map((run) => `<button class="run-row" data-run="${run.id}"><span>${escape(run.agentName)}</span><span class="status ${escape(run.status)}">${escape(run.status)}</span><small>${friendlyTime(run.createdAt)}</small></button>`).join('') : '<div class="empty"><h3>No runs yet.</h3><p>Run an agent to see its result here.</p></div>'}`
      }</section>`
        : ''
    }
    <p class="footnote">Closing the window leaves agents running. Work and history stay on the selected computer.</p>`;
}

function renderComputers() {
  main.innerHTML = `<div class="topline"><div><h1>Your computers</h1><p class="muted">Run work here. Pick it up from another computer.</p></div>${button('add', 'Add computer', true)}</div>
    ${computers
      .map((computer) => {
        const state = snapshots.get(computer.id);
        return `<div class="computer-row"><div><h2><span class="dot ${errors.has(computer.id) ? 'offline' : state ? 'online' : ''}"></span>${escape(computer.name)}</h2><p>${escape(computer.local ? (state?.host.name ?? 'Local host') : computer.origin)}</p><p>${errors.has(computer.id) ? escape(errors.get(computer.id)) : computer.local ? 'Background host runs independently of this window.' : 'Paired · credentials saved on this device'}</p></div><div class="actions">${button('open', 'Open workspace', false, `data-id="${computer.id}"`)}${computer.local ? button('share', 'Pair a device') : button('forget', 'Forget', false, `data-id="${computer.id}"`)}</div></div>`;
      })
      .join('')}
    <section class="section"><h2>Local host</h2><p class="muted">Keep this computer available to your paired devices.</p><div class="actions">${button('network', 'Enable Tailscale access')}${button('login', 'Start host at login')}${button('restart', 'Restart host')}</div><p class="footnote">${snapshots.get('local')?.address ? `Private address: ${escape(snapshots.get('local').address)}` : 'Tailscale must be installed and connected on both computers. Enabling access creates a private HTTPS route on port 8445.'}</p></section>
    <section class="section"><h2>Devices with access to this computer</h2>${
      snapshots.get('local')?.peers.length
        ? snapshots
            .get('local')
            .peers.map(
              (peer) =>
                `<div class="computer-row"><div><h3>${escape(peer.name)}</h3><p>Paired ${friendlyTime(peer.createdAt)}</p></div>${button('revoke', 'Revoke access', false, `data-id="${peer.id}"`)}</div>`,
            )
            .join('')
        : '<p class="muted">No other devices are paired yet.</p>'
    }</section>
    <p class="footnote">Forgetting a computer removes it from this app. Revoke access on the host to invalidate a paired device’s credential. A paired device can create agents and run work using your host’s account.</p>`;
}

function showDialog(title, intro, fields, submit, onSubmit) {
  content.innerHTML = `<h2 id="dialog-title">${title}</h2><p class="intro">${intro}</p><form id="form">${fields}<p class="form-error" role="alert" hidden></p><div class="dialog-actions">${button('close', 'Cancel')}<button type="submit" class="button primary">${submit}</button></div></form>`;
  content.querySelector('[data-action="close"]').type = 'button';
  content.querySelector('#form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const error = form.querySelector('.form-error');
    error.hidden = true;
    submitButton.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
      dialog.close();
      await refresh();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });
  dialog.showModal();
}

function showAddComputer(link = '') {
  showDialog(
    'Add a computer',
    'On the other computer, open OpenFactory and choose “Pair a device”. Paste its link here, or enter its private address and code.',
    `<label>Pairing link<input name="link" placeholder="openfactory://pair…" value="${escape(link)}" autocomplete="off" /></label><label>Computer address<input name="address" placeholder="https://computer.tailnet.ts.net:8445" required /></label><label>Pairing code<input name="code" placeholder="1234 5678" autocomplete="off" required /></label>`,
    'Pair computer',
    async (values) => {
      selected = await api.invoke('pair', {
        address: values.address.trim(),
        code: values.code.trim(),
      });
      revoked.delete(selected);
      const result = await api.invoke('boot');
      computers = result.computers;
      page = 'workspace';
      factoryId = null;
      notify('Computer paired. You can reconnect without another code.');
    },
  );
  const linkInput = content.querySelector('[name="link"]');
  const parse = () => {
    if (!linkInput.value.trim()) {
      return;
    }
    try {
      const url = new URL(linkInput.value.trim());
      if (url.protocol !== 'openfactory:' || url.hostname !== 'pair') {
        throw new Error('Invalid link');
      }
      content.querySelector('[name="address"]').value = url.searchParams.get('address') ?? '';
      content.querySelector('[name="code"]').value = decodeURIComponent(url.hash.slice(1));
    } catch {
      notify('Use a pairing link created by OpenFactory.');
    }
  };
  linkInput.addEventListener('input', parse);
  if (link) {
    parse();
  }
}

async function share() {
  const result = await api.invoke('pairing', { computerId: 'local' });
  const localOnly = result.origin.startsWith('http:');
  content.innerHTML = `<h2 id="dialog-title">Pair a device</h2><p class="intro">Open this link on your other computer, or enter this address and code in OpenFactory. Only pair devices you trust to run agents here.</p>
    ${localOnly ? `<div class="notice"><p>This address works only on this computer. Enable Tailscale access for remote pairing.</p><div class="actions">${button('network', 'Enable Tailscale access')}</div></div>` : ''}
    <div class="pairing"><img src="${escape(result.qr)}" alt="QR code containing the OpenFactory pairing link" /><div class="pair-code">${result.code.slice(0, 4)} ${result.code.slice(4)}</div><div class="address">${escape(result.origin)}</div><p class="muted" id="expiry"></p></div>
    <div class="dialog-actions">${button('close', 'Done')}${button('copy-link', 'Copy pairing link', true)}</div>`;
  content.querySelector('[data-action="copy-link"]').addEventListener('click', async () => {
    await api.invoke('copy', result.link);
    notify('Pairing link copied. It can be used once.');
  });
  const expiry = content.querySelector('#expiry');
  const timer = setInterval(() => {
    const seconds = Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000));
    expiry.textContent = seconds
      ? `One use · expires in ${Math.ceil(seconds / 60)} min`
      : 'Code expired. Close and create another pairing link.';
  }, 1000);
  expiry.textContent = 'One use · expires in 5 min';
  dialog.addEventListener(
    'close',
    () => {
      clearInterval(timer);
      api
        .invoke('cancel-pairing', { computerId: 'local', data: { id: result.id } })
        .catch(() => {});
    },
    { once: true },
  );
  if (!dialog.open) {
    dialog.showModal();
  }
}

function createFactory() {
  showDialog(
    'Create a factory',
    `Choose a folder on ${selected === 'local' ? 'this computer' : 'the selected remote computer'}. Agent work stays in that computer’s workspace.`,
    `<label>Name<input name="name" placeholder="My project" required maxlength="200" /></label><label>Folder path<input name="directory" placeholder="/home/you/projects/my-project" required /></label>${selected === 'local' ? `<div class="actions">${button('browse', 'Choose folder…')}</div>` : ''}`,
    'Create factory',
    async (values) => {
      const factory = await invoke('create-factory', values);
      factoryId = factory.id;
    },
  );
  const browse = content.querySelector('[data-action="browse"]');
  if (browse) {
    browse.type = 'button';
    browse.addEventListener('click', async () => {
      const directory = await api.invoke('choose-folder');
      if (directory) {
        content.querySelector('[name="directory"]').value = directory;
      }
    });
  }
}

function createAgent() {
  showDialog(
    'Create an agent',
    'Give it one clear job. Run it manually first; enable its schedule when you’re happy with the result.',
    `<label>Name<input name="name" placeholder="Daily reviewer" required maxlength="200" /></label><label>Instructions<textarea name="prompt" placeholder="Review recent changes and summarize anything that needs attention." required maxlength="32000"></textarea></label><label>Folder access<select name="sandbox"><option value="read-only">Read only</option><option value="workspace-write">Allow editing factory files</option></select></label><label>Schedule<select name="intervalMinutes"><option value="">Manual only</option><option value="60">Every hour</option><option value="360">Every 6 hours</option><option value="1440">Every day</option></select><small>New schedules are paused. Work runs on the selected computer.</small></label>`,
    'Create agent',
    async (values) => {
      await invoke('create-agent', {
        ...values,
        factoryId,
        intervalMinutes: values.intervalMinutes ? Number(values.intervalMinutes) : null,
      });
    },
  );
}

function inspectRun(id) {
  inspectedRunId = id;
  const run = snapshots.get(selected)?.runs.find((entry) => entry.id === id);
  if (!run) {
    return;
  }
  content.innerHTML = `<h2 id="dialog-title">${escape(run.agentName)}</h2><p class="intro"><span class="status ${escape(run.status)}">${escape(run.status)}</span> · ${friendlyTime(run.createdAt)}</p><h3>Instructions</h3><p>${escape(run.prompt)}</p><h3>Response</h3><div class="output">${escape(run.output || (run.status === 'running' ? 'The agent is working. Its response will appear here.' : run.status === 'queued' ? 'Waiting for the current agent to finish.' : 'No response saved.'))}</div>${run.error ? `<p class="form-error">${escape(run.error)}</p>` : ''}<div class="dialog-actions">${['queued', 'running'].includes(run.status) ? button('cancel-run', 'Cancel run', false, `data-id="${run.id}" ${connected.has(selected) ? '' : 'disabled'}`) : ''}${button('close', 'Close')}</div>`;
  if (!dialog.open) {
    dialog.showModal();
  }
}

dialog.addEventListener('close', () => {
  inspectedRunId = null;
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) {
    return;
  }
  try {
    if (target.dataset.computer) {
      selected = target.dataset.computer;
      page = 'workspace';
      factoryId = null;
      render();
    } else if (target.dataset.factory) {
      factoryId = target.dataset.factory;
      render();
    } else if (target.dataset.tab) {
      tab = target.dataset.tab;
      render();
    } else if (target.dataset.run) {
      inspectRun(target.dataset.run);
    } else {
      const action = target.dataset.action;
      if (
        ['run', 'schedule', 'network', 'login', 'restart', 'revoke', 'cancel-run'].includes(action)
      ) {
        target.disabled = true;
      }
      if (action === 'close') {
        dialog.close();
      }
      if (action === 'add') {
        showAddComputer();
      }
      if (action === 'manage') {
        page = 'computers';
        render();
      }
      if (action === 'new-factory') {
        createFactory();
      }
      if (action === 'new-agent') {
        createAgent();
      }
      if (action === 'share') {
        await share();
      }
      if (action === 'run') {
        await invoke('run', {}, target.dataset.id);
        tab = 'runs';
        notify('Run queued on this computer.');
      }
      if (action === 'schedule') {
        await invoke('schedule', { enabled: target.dataset.enabled === 'true' }, target.dataset.id);
      }
      if (action === 'cancel-run') {
        await invoke('cancel', {}, target.dataset.id);
        dialog.close();
      }
      if (action === 'network') {
        await api.invoke('enable-network');
        if (dialog.open) {
          dialog.close();
          await share();
        }
        notify('Private Tailscale access is ready.');
      }
      if (action === 'login') {
        await api.invoke('start-at-login');
        notify('The host will start when you sign in.');
      }
      if (action === 'restart') {
        await api.invoke('restart-host');
        await api.invoke('sync-start', { computerId: 'local' });
        notify('The local host restarted.');
      }
      if (action === 'open') {
        selected = target.dataset.id;
        page = 'workspace';
        factoryId = null;
      }
      if (action === 'forget') {
        const computerToForget = computers.find((computer) => computer.id === target.dataset.id);
        await api.invoke('forget', { id: target.dataset.id });
        computers = computers.filter((entry) => entry.id !== target.dataset.id);
        snapshots.delete(target.dataset.id);
        errors.delete(target.dataset.id);
        if (selected === target.dataset.id) {
          selected = 'local';
        }
        const subscription = subscriptions.get(target.dataset.id);
        subscription?.unsubscribe();
        subscriptions.delete(target.dataset.id);
        connected.delete(target.dataset.id);
        await cache.forget(computerToForget.hostId);
      }
      if (action === 'revoke') {
        await api.invoke('revoke', { computerId: 'local', id: target.dataset.id });
      }
      if (action) {
        await refresh();
        render();
      }
    }
  } catch (error) {
    notify(error.message);
  } finally {
    target.disabled = false;
  }
});

document.querySelector('#add-computer').addEventListener('click', () => showAddComputer());
document.querySelector('#manage-computers').addEventListener('click', () => {
  page = 'computers';
  render();
});
api.onPairingLink((link) => {
  if (dialog.open) {
    dialog.close();
  }
  showAddComputer(link);
});
boot().catch((error) => {
  main.textContent = error.message;
});
window.addEventListener('online', () => {
  if (cache) {
    void refresh();
  }
});
