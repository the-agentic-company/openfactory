#!/bin/sh
set -eu
umask 077
openfactory_token_file="${T3_TOKEN_FILE:-$HOME/.config/openfactory/t3-token}"
openfactory_token_dir=$(dirname "$openfactory_token_file")
mkdir -p "$openfactory_token_dir"
# Renew weekly; every issued token expires after thirty days.
if [ -s "$openfactory_token_file" ] && [ "$(stat -c %Y "$openfactory_token_file")" -gt "$(($(date +%s) - 604800))" ]; then
  exit 0
fi
openfactory_next_token=$(mktemp "$openfactory_token_dir/.t3-token.XXXXXX")
trap 'rm -f "$openfactory_next_token"' EXIT HUP INT TERM
"$HOME/.t3/bin/t3" auth session issue --scope orchestration:read --scope orchestration:operate --scope diagnostics:read --ttl 30d --label 'OpenFactory service' --token-only > "$openfactory_next_token"
test -s "$openfactory_next_token"
chmod 600 "$openfactory_next_token"
mv "$openfactory_next_token" "$openfactory_token_file"
