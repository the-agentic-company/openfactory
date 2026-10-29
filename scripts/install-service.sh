#!/bin/sh
set -eu
openfactory_repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$openfactory_repo" != "$HOME/git/openfactory" ]; then
  echo 'The supplied units expect ~/git/openfactory. Adjust the units for another checkout.' >&2
  exit 1
fi
test -f "$openfactory_repo/apps/web/.output/server/index.mjs"
python3 "$openfactory_repo/scripts/stage-release.py"
mkdir -p "$HOME/.config/systemd/user"
cp "$openfactory_repo"/deployment/systemd/openfactory.service "$openfactory_repo"/deployment/systemd/openfactory-runtime.service "$HOME/.config/systemd/user/"
if command -v tailscale >/dev/null 2>&1; then
  python3 "$openfactory_repo/scripts/configure-tailscale.py"
fi
systemctl --user daemon-reload
systemctl --user disable --now openfactory-token.timer 2>/dev/null || true
systemctl --user enable --now openfactory-runtime.service openfactory.service
systemctl --user restart openfactory-runtime.service openfactory.service
