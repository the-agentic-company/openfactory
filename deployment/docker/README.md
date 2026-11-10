# Self-host the control plane

The container serves OpenFactory with email/password registration and a shared
team workspace. Every registered user can use the same paired computers,
credentials, factories, and history. Accounts do not create private tenants.
Only allow trusted team members onto the network that can reach it. Email
addresses identify accounts; the server does not send verification or recovery
emails. Passwords require 12–128 characters and are stored as salted scrypt
hashes. Sessions last seven days and survive restarts. `/auth/account` offers
sign out. Set `OPENFACTORY_REGISTRATION=disabled` to close registration while
retaining existing logins.

Run behind a private HTTPS reverse proxy. The gateway requires the configured
HTTPS Host and Origin, checks every app and API request, and uses Secure,
HttpOnly, SameSite cookies. Do not expose the internal dashboard port. Tailscale
Funnel and public HTTP listeners are unnecessary.

```sh
docker volume create openfactory-data
docker run -d --name openfactory --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e OPENFACTORY_PUBLIC_URL=https://openfactory.example.com \
  -v openfactory-data:/data \
  public.ecr.aws/n6r4t0d8/openfactory/control-plane:v0.1.2
```

Pin the published digest in production. The container runs as UID 1000. Mount
writable storage there for accounts, sessions, paired-computer credentials,
settings, and read caches. Back up `/data` including SQLite WAL files using an
atomic volume snapshot, or stop the container before copying files. Restore the
volume into a stopped container and keep its original ownership. Old sessions
and paired-machine access are sensitive: protect backups like credentials.

The control-plane image contains no local agent runtime or provider login.
Pair an already authenticated desktop runtime through Settings, then select
that computer. Agents continue executing there; provider credentials stay on
the paired machine. Allow the control-plane Tailscale node to reach each chosen
runtime's HTTPS pairing/RPC port (normally 8445). Until a computer is paired,
the workspace has no execution host. Local-only setup actions are unavailable.

## Verify and release

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
node --test deployment/docker/gateway.test.mjs
docker build -f deployment/docker/Dockerfile -t openfactory-control-plane:verify .
node deployment/docker/verify-image.mjs openfactory-control-plane:verify
```

The image verifier starts a real container, registers a temporary account,
checks app/API protection and server-rendered HTML, restarts the container,
verifies persistent login, and tests logout. It also uses a real browser to
submit registration, login, and logout forms and wait for the hydrated app. It deletes its container and volume.

The `Control plane container` workflow verifies pull requests and publishes
versioned multi-architecture images for `control-plane-v<semver>` tags. Configure
repository variables `OPENFACTORY_CONTAINER_RELEASE_ROLE_ARN` and
`OPENFACTORY_CONTAINER_REPOSITORY` with the release role and public ECR path.
The AWS role trusts only this repository's control-plane release tags. It can
upload images to that repository, without access to the deployment host or
stored configuration. Deployments remain owned by the hosting repository.
