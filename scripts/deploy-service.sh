#!/bin/sh
set -eu
openfactory_repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python3 "$openfactory_repo/scripts/stage-release.py"
systemctl --user restart openfactory-runtime.service openfactory.service
