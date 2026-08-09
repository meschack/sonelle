#!/bin/sh

set -eu

REPOSITORY="Meschack/sonelle"
RUST_TOOLCHAIN="1.95.0"
PNPM_VERSION="11.7.0"
INSTALL_DIRECTORY="$HOME/Applications"

say() {
  printf '\nSonelle · %s\n' "$1"
}

fail() {
  printf '\nSonelle could not continue: %s\n' "$1" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

confirm() {
  if [ "${SONELLE_YES:-0}" = "1" ]; then
    return 0
  fi

  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

[ "$(uname -s)" = "Darwin" ] || fail "this early-access installer currently supports macOS only."
has curl || fail "curl is required."
has tar || fail "tar is required."

if ! xcode-select -p >/dev/null 2>&1; then
  say "Apple's command-line tools are required to build Sonelle."
  xcode-select --install >/dev/null 2>&1 || true
  fail "finish the Apple tools installation, then run the Sonelle command again."
fi

TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/sonelle-install.XXXXXX")"
trap 'rm -rf "$TEMP_DIRECTORY"' EXIT HUP INT TERM

if ! has brew; then
  say "Homebrew is needed to install the web build tools."
  confirm "Download and run Homebrew's official installer?" || fail "Homebrew installation was declined."
  curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
    -o "$TEMP_DIRECTORY/install-homebrew.sh"
  /bin/bash "$TEMP_DIRECTORY/install-homebrew.sh"

  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! has node; then
  say "Installing Node.js."
  brew install node
fi

if ! has rustup; then
  say "Installing the Rust toolchain."
  confirm "Download and run Rust's official installer?" || fail "Rust installation was declined."
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$TEMP_DIRECTORY/rustup.sh"
  sh "$TEMP_DIRECTORY/rustup.sh" -s -- -y --profile minimal --default-toolchain "$RUST_TOOLCHAIN"
fi

if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

has rustup || fail "rustup was installed but is not available in this shell. Open a new terminal and retry."
rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal
rustup default "$RUST_TOOLCHAIN"

has corepack || fail "Corepack is unavailable. Update Node.js and run the installer again."
corepack enable
corepack prepare "pnpm@$PNPM_VERSION" --activate

say "Finding the latest Sonelle release."
LATEST_URL="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPOSITORY/releases/latest")"
RELEASE_TAG="${LATEST_URL##*/}"
[ -n "$RELEASE_TAG" ] || fail "the latest release tag could not be determined."

SOURCE_ARCHIVE="$TEMP_DIRECTORY/sonelle.tar.gz"
SOURCE_DIRECTORY="$TEMP_DIRECTORY/source"
mkdir -p "$SOURCE_DIRECTORY"
curl -fsSL "https://github.com/$REPOSITORY/archive/refs/tags/$RELEASE_TAG.tar.gz" -o "$SOURCE_ARCHIVE"
tar -xzf "$SOURCE_ARCHIVE" -C "$SOURCE_DIRECTORY" --strip-components=1

say "Building Sonelle $RELEASE_TAG. This can take a while on the first run."
cd "$SOURCE_DIRECTORY"
pnpm install --frozen-lockfile
APPLE_SIGNING_IDENTITY="-" pnpm --filter @sonelle/desktop tauri build --bundles app

APP_PATH="$(find "$SOURCE_DIRECTORY" -path '*/bundle/macos/Sonelle.app' -type d -print -quit)"
[ -n "$APP_PATH" ] || fail "the build finished but Sonelle.app was not found."

mkdir -p "$INSTALL_DIRECTORY"
DESTINATION="$INSTALL_DIRECTORY/Sonelle.app"
if [ -e "$DESTINATION" ]; then
  BACKUP="$INSTALL_DIRECTORY/Sonelle.backup.$(date +%Y%m%d%H%M%S).app"
  say "Moving the existing app to $BACKUP."
  mv "$DESTINATION" "$BACKUP"
fi

ditto "$APP_PATH" "$DESTINATION"
codesign --verify --deep --strict "$DESTINATION" || fail "the locally signed app did not pass verification."

say "Sonelle is installed at $DESTINATION"
printf 'Open it from your Applications folder when you are ready.\n'
