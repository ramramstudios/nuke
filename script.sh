#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MIN_NODE_MAJOR=20
MIN_NODE_MINOR=9

SCRIPT_NAME="$(basename "$0")"

log() {
  printf '\n[%s] %s\n' "$SCRIPT_NAME" "$1"
}

die() {
  printf '\n[%s] Error: %s\n' "$SCRIPT_NAME" "$1" >&2
  exit 1
}

version_gte() {
  local current="$1"
  local required="$2"
  local current_major current_minor current_patch
  local required_major required_minor required_patch

  IFS='.' read -r current_major current_minor current_patch <<<"$current"
  IFS='.' read -r required_major required_minor required_patch <<<"$required"

  current_major="${current_major:-0}"
  current_minor="${current_minor:-0}"
  current_patch="${current_patch:-0}"
  required_major="${required_major:-0}"
  required_minor="${required_minor:-0}"
  required_patch="${required_patch:-0}"

  if (( current_major > required_major )); then
    return 0
  fi
  if (( current_major < required_major )); then
    return 1
  fi
  if (( current_minor > required_minor )); then
    return 0
  fi
  if (( current_minor < required_minor )); then
    return 1
  fi
  if (( current_patch >= required_patch )); then
    return 0
  fi

  return 1
}

use_node_bin_dir() {
  local bin_dir="$1"
  if [[ -x "$bin_dir/node" && -x "$bin_dir/npm" ]]; then
    export PATH="$bin_dir:$PATH"
    return 0
  fi
  return 1
}

ensure_runtime() {
  local candidate

  if [[ -n "${NODE_BIN_DIR:-}" ]]; then
    use_node_bin_dir "$NODE_BIN_DIR" || die "NODE_BIN_DIR does not contain working node/npm binaries: $NODE_BIN_DIR"
  fi

  if command -v node >/dev/null 2>&1; then
    local current_node
    current_node="$(node -v 2>/dev/null | sed 's/^v//')"
    if version_gte "$current_node" "${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0"; then
      return 0
    fi
  fi

  for candidate in \
    "/usr/local/opt/node@22/bin" \
    "/opt/homebrew/opt/node@22/bin" \
    "/usr/local/opt/node@20/bin" \
    "/opt/homebrew/opt/node@20/bin" \
    "/tmp/node-v22.22.2-darwin-x64/bin"
  do
    if use_node_bin_dir "$candidate"; then
      local discovered_node
      discovered_node="$(node -v 2>/dev/null | sed 's/^v//')"
      if version_gte "$discovered_node" "${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0"; then
        return 0
      fi
    fi
  done

  die "Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required. Install node@22 or set NODE_BIN_DIR to a compatible bin directory."
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    if [[ ! -f .env.example ]]; then
      die ".env.example not found"
    fi
    cp .env.example .env
    log "Created .env from .env.example"
  fi
}

ensure_secret_line() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env; then
    perl -0pi -e "s#^${key}=.*#${key}=\"${value}\"#m" .env
  else
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}

generate_secrets_if_needed() {
  ensure_env_file

  local encryption_key jwt_secret
  encryption_key="$(awk -F'"' '/^ENCRYPTION_KEY=/{print $2}' .env)"
  jwt_secret="$(awk -F'"' '/^JWT_SECRET=/{print $2}' .env)"

  if [[ -z "$encryption_key" || "$encryption_key" == "0000000000000000000000000000000000000000000000000000000000000000" ]]; then
    encryption_key="$(openssl rand -hex 32)"
    ensure_secret_line "ENCRYPTION_KEY" "$encryption_key"
    log "Generated ENCRYPTION_KEY in .env"
  fi

  if [[ -z "$jwt_secret" || "$jwt_secret" == "change-me-to-a-random-64-char-string" ]]; then
    jwt_secret="$(openssl rand -hex 48)"
    ensure_secret_line "JWT_SECRET" "$jwt_secret"
    log "Generated JWT_SECRET in .env"
  fi
}

run_npm() {
  ensure_runtime
  npm "$@"
}

run_npx() {
  ensure_runtime
  npx "$@"
}

install_deps() {
  log "Installing dependencies"
  run_npm install
}

setup_env() {
  ensure_runtime
  generate_secrets_if_needed
}

db_push() {
  setup_env
  log "Pushing Prisma schema"
  run_npm run db:push
}

db_seed() {
  setup_env
  log "Seeding broker registry"
  run_npm run db:seed
}

db_reset() {
  setup_env
  log "Resetting database and reseeding"
  run_npm run db:reset
}

lint_app() {
  log "Running ESLint"
  run_npm run lint
}

dev_server() {
  setup_env
  log "Starting development server on http://localhost:3000"
  run_npm run dev
}

build_app() {
  setup_env
  log "Building production bundle"
  run_npm run build
}

start_prod() {
  setup_env
  log "Starting production server on http://localhost:3000"
  run_npm run start
}

bootstrap_dev() {
  install_deps
  setup_env
  db_push
  db_seed
  dev_server
}

bootstrap_prod() {
  install_deps
  setup_env
  db_push
  db_seed
  build_app
  start_prod
}

doctor() {
  ensure_runtime
  printf 'Project: %s\n' "$ROOT_DIR"
  printf 'Node:    %s\n' "$(node -v)"
  printf 'npm:     %s\n' "$(npm -v)"
  printf '.env:    %s\n' "$([[ -f .env ]] && echo present || echo missing)"
  printf 'DB file: %s\n' "$([[ -f prisma/dev.db ]] && echo present || echo missing)"
}

print_help() {
  cat <<'EOF'
Usage:
  ./script.sh
  ./script.sh <command>

Commands:
  doctor          Show runtime and local setup info
  install         Install dependencies
  env             Create .env if needed and generate secrets
  db-push         Push Prisma schema to the database
  seed            Seed broker data
  db-reset        Reset the database and reseed
  lint            Run ESLint
  dev             Start the development server
  build           Build the production bundle
  prod            Build and start the production server
  start           Start the production server
  full-dev        Alias for bootstrap-dev
  full-prod       Alias for bootstrap-prod
  bootstrap-dev   Install, prepare env, push schema, seed, then run dev
  bootstrap-prod  Install, prepare env, push schema, seed, build, then run prod
  help            Show this help

Notes:
  - Requires Node.js 20.9+.
  - If your Node 20+/22+ binaries are not on PATH, set NODE_BIN_DIR first.
    Example:
      export NODE_BIN_DIR="/usr/local/opt/node@22/bin"
      ./script.sh bootstrap-dev
EOF
}

show_menu() {
  cat <<'EOF'
NUKE startup menu
  1. Doctor / environment check
  2. Install dependencies
  3. Create .env and generate secrets
  4. Push Prisma schema
  5. Seed broker data
  6. Reset DB and reseed
  7. Run lint
  8. Start development server
  9. Build production bundle
  10. Start production server
  11. Bootstrap full dev flow
  12. Bootstrap full prod flow
  0. Exit
EOF

  printf '\nChoose an option: '
  read -r choice

  case "$choice" in
    1) doctor ;;
    2) install_deps ;;
    3) setup_env ;;
    4) db_push ;;
    5) db_seed ;;
    6) db_reset ;;
    7) lint_app ;;
    8) dev_server ;;
    9) build_app ;;
    10) start_prod ;;
    11) bootstrap_dev ;;
    12) bootstrap_prod ;;
    0) exit 0 ;;
    *) die "Unknown option: $choice" ;;
  esac
}

main() {
  local command="${1:-menu}"

  case "$command" in
    menu) show_menu ;;
    doctor) doctor ;;
    install) install_deps ;;
    env) setup_env ;;
    db-push) db_push ;;
    seed) db_seed ;;
    db-reset) db_reset ;;
    lint) lint_app ;;
    dev) dev_server ;;
    build) build_app ;;
    prod) build_app; start_prod ;;
    start) start_prod ;;
    full-dev|bootstrap-dev) bootstrap_dev ;;
    full-prod|bootstrap-prod) bootstrap_prod ;;
    help|-h|--help) print_help ;;
    *) die "Unknown command: $command. Run './script.sh help' for usage." ;;
  esac
}

main "${1:-menu}"
