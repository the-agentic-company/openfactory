#!/bin/sh
set -eu
# Keep the current desktop-owned server undisturbed; the boot service takes over when it exits.
openfactory_t3_port="${OPENFACTORY_T3_PORT:-3773}"
while /usr/bin/bash -c 'exec 3<>/dev/tcp/127.0.0.1/"$1"' _ "$openfactory_t3_port" 2>/dev/null; do
  sleep 3
done
