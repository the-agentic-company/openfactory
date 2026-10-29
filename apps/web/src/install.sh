#!/bin/sh
# Installs the self-contained OpenFactory CLI. Desktop installers are on /download.
# OPENFACTORY_VERSION pins a version; OPENFACTORY_HOME and OPENFACTORY_INSTALL_BIN_DIR
# change the installation location. OPENFACTORY_RELEASE_BASE_URL can point at a mirror.
set -eu

repository='__OPENFACTORY_RELEASES_REPOSITORY__'
repository="${OPENFACTORY_RELEASES_REPOSITORY:-$repository}"
base_url="${OPENFACTORY_RELEASE_BASE_URL:-https://github.com/${repository}/releases/download}"
releases_url="${OPENFACTORY_RELEASES_URL:-https://github.com/${repository}/releases/latest}"
install_home="${OPENFACTORY_HOME:-$HOME/.local/share/openfactory}"
bin_dir="${OPENFACTORY_INSTALL_BIN_DIR:-$HOME/.local/bin}"

fail() { printf 'OpenFactory: %s\n' "$1" >&2; exit 1; }
fetch() { curl --fail --show-error --silent --location "$1" --output "$2"; }
command -v curl >/dev/null 2>&1 || fail 'curl is required.'
command -v tar >/dev/null 2>&1 || fail 'tar is required.'
command -v readlink >/dev/null 2>&1 || fail 'readlink is required.'
case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) fail 'This installer supports macOS and Linux. For Windows, use the installer on the download page.' ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x64 ;;
  *) fail "Unsupported architecture: $(uname -m)." ;;
esac
if command -v sha256sum >/dev/null 2>&1; then
  checksum() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  checksum() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  fail 'sha256sum or shasum is required to verify downloads.'
fi
case "$install_home:$bin_dir" in
  /*:/*) ;;
  *) fail 'OPENFACTORY_HOME and OPENFACTORY_INSTALL_BIN_DIR must be absolute paths.' ;;
esac
if [ -e "$bin_dir/openfactory" ] || [ -L "$bin_dir/openfactory" ]; then
  [ -L "$bin_dir/openfactory" ] || fail "$bin_dir/openfactory already exists; choose another bin directory."
  case "$(readlink "$bin_dir/openfactory")" in
    "$install_home/runtime/versions/"*) ;;
    *) fail "$bin_dir/openfactory belongs to another installation; choose another bin directory." ;;
  esac
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
version="${OPENFACTORY_VERSION:-}"
if [ -z "$version" ]; then
  printf 'Finding the latest OpenFactory release...\n'
  curl --fail --show-error --silent --location --header 'Accept: application/json' "$releases_url" --output "$work_dir/release.json" || fail 'Could not find a published release. Visit the download page or set OPENFACTORY_VERSION.'
  version="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"desktop-v\([^"]*\)".*/\1/p' "$work_dir/release.json" | head -n 1)"
fi
version="${version#desktop-v}"
case "$version" in
  ''|*[!0-9A-Za-z.+-]*) fail 'The release version is invalid or no desktop release has been published yet.' ;;
esac
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) fail 'Expected a release version such as 0.1.1.' ;;
esac

versions_dir="$install_home/runtime/versions"
target_dir="$versions_dir/$version"
if [ -f "$target_dir/.install-complete" ] && [ "$(cat "$target_dir/.install-complete")" = "$version" ] && "$target_dir/node" --version >/dev/null 2>&1 && [ "$("$target_dir/openfactory" --version 2>/dev/null)" = "$version" ]; then
  printf 'OpenFactory %s is already installed.\n' "$version"
else
  archive="openfactory-cli-${version}-${platform}-${arch}.tar.gz"
  printf 'Downloading OpenFactory %s for %s-%s...\n' "$version" "$platform" "$arch"
  fetch "$base_url/desktop-v$version/SHA256SUMS" "$work_dir/SHA256SUMS" || fail 'Release checksums are unavailable. No installed version was changed.'
  expected="$(awk -v name="$archive" '$2 == name || $2 == "*" name {print $1}' "$work_dir/SHA256SUMS")"
  [ "${#expected}" -eq 64 ] || fail "$archive is not listed with a SHA-256 checksum in this release."
  fetch "$base_url/desktop-v$version/$archive" "$work_dir/$archive" || fail 'Could not download the CLI. No installed version was changed.'
  [ "$(checksum "$work_dir/$archive")" = "$expected" ] || fail 'Checksum mismatch. No installed version was changed.'
  mkdir -p "$versions_dir"
  staging="$(mktemp -d "$versions_dir/.install-XXXXXX")"
  trap 'rm -rf "$work_dir"; if [ -n "${staging:-}" ]; then rm -rf "$staging"; fi' 0
  tar -xzf "$work_dir/$archive" -C "$staging" --strip-components=1
  [ -f "$staging/runtime.mjs" ] && [ -x "$staging/openfactory" ] && [ -x "$staging/node" ] || fail 'The release archive is incomplete.'
  "$staging/node" --version >/dev/null || fail 'The bundled runtime cannot run on this computer.'
  [ "$("$staging/openfactory" --version)" = "$version" ] || fail 'The downloaded CLI has the wrong version.'
  printf '%s\n' "$version" > "$staging/.install-complete"
  # Only replace an incomplete copy after its replacement has passed verification.
  rm -rf "$target_dir"
  mv "$staging" "$target_dir"
  staging=
fi
mkdir -p "$bin_dir"
ln -sfn "$target_dir/openfactory" "$bin_dir/openfactory"
printf '\nInstalled OpenFactory %s.\n' "$version"
case ":$PATH:" in
  *":$bin_dir:"*) printf 'Run openfactory --help to get started.\n' ;;
  *) printf 'Add %s to your PATH, then run openfactory --help.\n' "$bin_dir" ;;
esac
printf 'Start the runtime with openfactory serve. Desktop installers are on the download page.\n'
