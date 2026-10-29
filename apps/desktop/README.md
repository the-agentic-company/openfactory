# OpenFactory desktop

Electron bundles the same web application as the browser interface. Overview, factories,
agents, sessions, and Settings use the shared React routes and components. The app starts
an OpenFactory-owned background runtime and a private loopback web server. Closing the
window leaves the execution host running.

## Try the application

Install OpenFactory on each computer. Install the Codex CLI and sign in on each computer
that executes agents. Use the shared **Create agent** flow to choose a folder and create a
factory. Device connections and pairing are in **Settings** in both the browser and Electron.

On Linux, the packaged app enables `openfactory-desktop-prototype.service` when a systemd
user session is available. Running after logout requires user lingering. The app does not
change that operating-system setting. On macOS, **Settings → Start host at login** enables
the login item.

## Pair two installations

Install and connect Tailscale on both computers, using the same tailnet. Install OpenFactory
on both as well. No T3 Connect or OpenFactory cloud account is involved.

1. On the host, choose **Settings → Enable Tailscale access**.
   This creates a private Tailscale Serve HTTPS route on port **8445** to the local host.
   An existing unrelated mapping on that port is refused rather than replaced.
   Tailscale may require an initial HTTPS approval in its own setup flow.
2. In **Settings**, choose **Pair a device**. Copy the link, or use the displayed address and eight-digit code.
3. On the other computer, open **Settings → Add computer** and paste the link, or enter the address and code.
4. In **Settings**, choose **Use computer** for the saved computer. Its folders, agents, and runs are separate from yours.

A code expires after five minutes, works once, and is disabled after five wrong attempts.
Closing the pairing dialog invalidates its unused code. Pair only trusted devices: pairing
permits creating factories, starting agents, and editing files when workspace-write access is chosen.
Credentials remain in Electron's main process. The renderer receives only application data.

Saved device tokens use Electron safeStorage when an OS keyring is available. Without one,
this prototype falls back to a file restricted to your user account (0600), without encryption
at rest. Host-side device credentials are stored as hashes. Pairing codes are never logged.
The local owner credential is in a separate 0600 file.

**Forget** removes a computer from this client. **Revoke access** on the host invalidates a
device's credential. Remote clients cannot create pairing codes, revoke other clients, change
network exposure, or stop the host. Tailscale ACLs continue to apply to connectivity.

## Development and verification

From the repository root:

```sh
pnpm install
pnpm --filter @openfactory/desktop dev
pnpm --filter @openfactory/desktop test
pnpm --filter @openfactory/desktop build
pnpm --filter @openfactory/desktop test:package
```

`pnpm --filter @openfactory/desktop dev` opens Electron against the shared Vite development
server at `http://127.0.0.1:48181`. React and CSS edits hot-reload inside the app. Saved computers,
credentials, and the selected computer use the same native storage as the installed app.
The background execution host stays running when the interface reloads or closes.
Restart the development app after changes to Electron's main process or preload.
`OPENFACTORY_DESKTOP_DEV_PORT` overrides the development port and refuses an occupied port.

`pnpm --filter @openfactory/desktop test:development` starts an isolated UI listener against
the existing local host. It verifies a real CSS HMR update, then restores the stylesheet and
checks that the same saved credential still reaches the same host. A running local host is required.

`build:workspace` builds the owned runtime and the web application into isolated staging
folders, then bundles them in the app. Electron loads that web application over loopback.
The preload bridge supplies native connection management. Host tokens stay outside the
renderer. The web server forwards authenticated runtime requests to the selected computer.

On Linux systems that restrict unprivileged user namespaces, running Electron directly from
node_modules may fail because its sandbox helper is not installed with system permissions.
For development, run `pnpm --filter @openfactory/desktop setup:sandbox` and authenticate in
the system administrator dialog. This makes the helper beside the Electron executable root-owned with mode `4755`.
Electron uses it automatically on future launches. Run setup again after reinstalling
or upgrading Electron, because the dependency can replace its helper.
The `.deb` installer configures its bundled helper. The headless QA run used `--no-sandbox`
only for its temporary Xvfb test process; that flag is absent from the application launcher
and package. The package's background host also runs independently of the graphical sandbox.

Host tests start real HTTP servers and executable provider fixtures. They cover one-time pairing,
expiry, guessing limits, stale-dialog cancellation, restart persistence, revocation, host isolation,
concurrent-host exclusion, literal prompt handling, queueing, cancellation, failed/incomplete
provider responses, and interval dispatch. They do not call a paid model.
`test:package` starts the actual packaged Electron executable in Node mode and verifies its
bundled host, authentication, and graceful shutdown without importing checkout dependencies.

## Storage and operation

The default data directory is `~/.local/share/openfactory-desktop-prototype`:

- `host.sqlite`: host identity, factories, agents, device grants, the latest 200 runs, and sync checkpoints.
- `host.json`: legacy data, imported when SQLite has no saved host. The import leaves this file untouched.
- `owner-token`: private local administration credential.
- `computers.json`: this client's saved remote hosts and protected credentials.
- `connection.json`: local listener information; `host.lock`: single-host ownership.
- `host.log`: detached-host diagnostics. A systemd-managed host logs to the user journal instead.

The shared workspace uses the runtime's SQLite database in
`~/.config/openfactory/runtime`. Factory profiles, appearances, and scorer settings are read
from the selected host. Native filesystem integrations that have not moved to the runtime
still execute in the interface server's environment.

The original standalone renderer and its SQLite sync endpoints remain in the source tree
for compatibility and replication tests. Electron's main window loads the shared web app.
Those legacy renderer caches are not the shared interface's offline storage.

Optional environment variables, useful for running isolated test installations:

```sh
OPENFACTORY_DESKTOP_HOME=/tmp/my-openfactory-prototype \
OPENFACTORY_DESKTOP_PORT=48280 \
pnpm --filter @openfactory/desktop dev
```

`OPENFACTORY_CODEX_PATH` selects a Codex executable for a directly launched host.
`OPENFACTORY_DESKTOP_ORIGIN` sets a preconfigured Tailscale HTTPS address.
The listener always binds to loopback. For a manually operated headless test host:

```sh
pnpm --filter @openfactory/desktop host
```

To stop the installed user service, run
`systemctl --user stop openfactory-desktop-prototype.service`.
To disable its private network mapping, run `tailscale serve --https=8445 off`.
Removing a package does not delete your factory history or revoke tokens stored in that history.

## Try it on macOS

Requires macOS 13 or newer. Use `dist/OpenFactory-0.1.1-arm64.zip` for Apple Silicon (M1 or newer), or
`dist/OpenFactory-0.1.1-x64.zip` for an Intel Mac. Unzip it and move
**OpenFactory.app** into **Applications** before opening it, so the background host
has a permanent location. Codex and the Tailscale CLI must be installed and signed in on that Mac.
Homebrew's `/opt/homebrew/bin` and `/usr/local/bin` are included in the app's command lookup.

These are unsigned, unnotarized cross-builds made on Linux. macOS launch and device pairing
have not been verified on physical Apple hardware. Gatekeeper may block the first launch;
use **System Settings → Privacy & Security → Open Anyway** for this specific app.
If macOS reports that the app's signature is invalid or the app is damaged, apply a local
ad-hoc signature to this prototype, then try opening it again:

```sh
codesign --force --deep --sign - "/Applications/OpenFactory.app"
```

The ad-hoc signature is for local testing; it is not a Developer ID signature or notarization.
**Settings → Start host at login** enables the Mac login item. Linux systemd service
installation is skipped on macOS. Closing the app leaves its detached host running.

To rebuild both Mac architectures from the repository root:

```sh
pnpm --filter @openfactory/desktop build:mac
pnpm --filter @openfactory/desktop test:mac
```

## Research and prototype boundary

The design borrows the separation between host identity, connection route, and credential from
[T3's connection catalog](https://github.com/pingdotgg/t3code/blob/4432fbef71817c279290f86549be660af25005f2/packages/client-runtime/src/connection/catalog.ts)
and its [direct-pairing flow](https://github.com/pingdotgg/t3code/blob/4432fbef71817c279290f86549be660af25005f2/docs/user/remote-access.md).
No T3 runtime code is imported. Networking follows
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), and the desktop boundary follows
[Electron's security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).

This version uses manual host addition. It does not bundle Tailscale or Codex, install updates,
or build signed macOS or Windows installers. Linux x64 launch is verified. Mac ZIPs are
cross-built and structurally checked, but require testing on a Mac. A second physical
computer is still needed to confirm end-to-end tailnet pairing on your devices; local two-host
verification does not prove your tailnet ACLs or network configuration.
