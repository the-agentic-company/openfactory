# OpenFactory mobile

The iOS and Android app uses Expo and React Native. It connects to the same paired desktop host as the desktop workspace. Agents, provider credentials, repository files, and SQLite stay on that computer.

## Run

Use the repository's Node and pnpm versions, then:

```sh
pnpm install
pnpm dev:mobile
```

Open the project in Expo Go on a phone or press `i` or `a` in Expo's terminal for a simulator or emulator. Expo SDK 58 pins its supported React and React Native versions in this package. Its TypeScript version follows Expo's compatibility check; the other packages keep the repository compiler.

For a native development build with local platform tooling:

```sh
pnpm --filter @openfactory/mobile ios
pnpm --filter @openfactory/mobile android
```

On the computer, open OpenFactory Settings, enable Tailscale access, and choose **Pair a device**. Keep the pairing dialog open. Enter its HTTPS address and code in the mobile app. Both devices must be able to reach that address. The desktop host currently exposes private HTTPS on port 8445. Use the displayed address, not the web workspace's port 8018.

Pairing links use the same `openfactory://pair?address=…#code` format as desktop. Installed native builds can open them. Expo Go uses the manual form. Saved computer credentials use iOS Keychain or Android Keystore through Expo SecureStore. Settings can add, switch, and forget computers. Revoke a device's access on the host computer.

Rebuild and restart older runtime and desktop installations before connecting. Mobile needs the shared protocol's usage and pull-request operations. HTTP loopback works in the iOS simulator for local fixtures. Use HTTPS for device builds.

## Product workflows

| Desktop section         | Native mobile implementation                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Computers               | Pair, save securely, switch, forget                                                                     |
| Factories               | Create with a directory on the host, select, remove, edit name and icon                                 |
| Agents                  | Create, edit, run, pause and resume schedules                                                           |
| Agent definition        | Edit agent.md with optimistic conflict checks                                                           |
| Agent configuration     | Providers, models, permissions, triggers, worktrees, interaction modes, model options                   |
| Conversations           | Live polling, Markdown, code, follow-ups, queued messages, stop, conversation selection                 |
| Agent apps              | Sandboxed HTML, source, refresh, shared SQLite bridge, confirmed agent requests                         |
| Run detail              | Artifacts, timeline, agents, scores, metadata, follow-ups                                               |
| Dashboard and runs      | Factory scope, status filters, search, recent runs, coverage limits                                     |
| Usage                   | Date ranges, per-agent totals and pricing coverage, factory daily/model buckets                         |
| Pull requests           | Host-side GitHub lookup, time range, search, checks, reviews, GitHub links                              |
| Teams                   | Create from live agents, shared instructions, run lead or member, edit YAML through factory definitions |
| Factory definition      | Add, edit, remove and save files with revision checks                                                   |
| Scorers                 | Create rules, evaluate output with the shared scorer, remove rules                                      |
| Marketplace             | Search, source review, entry selection, import with source and target revisions                         |
| Appearance and webhooks | Icon/emoji/initials, colors, endpoint, signing secret, delivery history                                 |
| Visualizations          | Sandboxed HTML, source, reset, expanded view                                                            |

Native controls replace desktop DOM widgets. Rich HTML content alone uses an isolated WebView. Host administration, including Tailscale exposure, pairing-code creation, device revocation, provider installation, login-at-boot, and Electron updates, stays on the host. Mobile has no Electron process or local agent executor. Store signing and distribution require your Apple or Google account; bundle export does not produce a signed installer.

The owned runtime does not currently produce binary attachments. Imported attachment metadata appears in run detail; mobile does not download legacy T3 image binaries. Physical-device testing, push notifications, and background execution are not part of this implementation. Polling pauses when the app leaves the foreground and resumes when it returns.

## Shared code

T3 Code's separation of `apps/` from `packages/contracts` and `packages/shared` informed this layout. OpenFactory uses its existing runtime protocol rather than adding a second backend.

- `packages/core` owns domain schemas, schedules, team validation, run grouping, run artifacts and scores, appearance, marketplace models, and the HTML sandbox document.
- `packages/protocol` owns portable request and response schemas, Effect RPC definitions, definition-file schemas, settings contracts, and the agent-app bridge schema. It imports no Node filesystem or server code.
- `packages/client` owns the Fetch-based remote RPC client, pairing, bounded history reads, run detail loading, agent-definition updates, and team file creation. Desktop remote calls and mobile use this client.
- `packages/runtime` owns filesystem, SQLite, CLI execution, GitHub commands and usage transcript reads. Existing server import paths re-export the portable contracts; there is one contract definition.
- `apps/app` keeps web routes and DOM components. Its history, definition, team, run-detail, and usage code calls the shared implementations.
- `apps/mobile/src/screens` keeps native screens. `storage.ts` is the secure-storage adapter. `App.tsx` owns the connection lifecycle and query cache. Switching computers clears cached data.

When adding a feature, put validation in core or protocol and reusable workflows in client. Add host operations to the protocol and runtime together. Keep Node APIs out of client and core. Use DOM in apps/app and native controls in apps/mobile.

## Verify and package

```sh
pnpm check:mobile
pnpm build:mobile
pnpm --filter @openfactory/desktop test -- test/runtime-rpc.test.mjs
```

The mobile build runs Metro and Hermes for both platforms. The desktop RPC test pairs a real portable client with an isolated authenticated host and checks definitions, teams, history, usage and PR reads. Repository tests also exercise the shared implementations through the desktop server functions.

`eas.json` includes internal preview, iOS simulator, and production profiles. For signed builds, sign in to Expo and use your own Apple or Google signing credentials:

```sh
cd apps/mobile
pnpm dlx eas-cli build --profile preview --platform android
pnpm dlx eas-cli build --profile simulator --platform ios
pnpm dlx eas-cli build --profile production --platform all
```

Expo's [monorepo support](https://docs.expo.dev/guides/monorepos/) resolves workspace packages through the default Metro configuration. No copied core, custom watch folders, or alternative package manager is needed.
