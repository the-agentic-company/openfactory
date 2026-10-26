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
cp "$openfactory_repo"/deployment/systemd/openfactory* "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now openfactory.service openfactory-token.timer
systemctl --user restart openfactory.service
