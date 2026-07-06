#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="/opt/selfchecks"
SOURCE_DIR=""
ARCHIVE_URL="${SELFCHECKS_ARCHIVE_URL:-}"
SKIP_SYSTEM_INSTALL="0"
SKIP_START="0"
SERVER_IP=""

log() {
  printf '\033[1;36m[selfchecks-install]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[selfchecks-install]\033[0m %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

docker_compose() {
  if [ -n "${SUDO}" ]; then
    $SUDO docker compose "$@"
    return
  fi

  docker compose "$@"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --archive-url)
      ARCHIVE_URL="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --source-dir)
      SOURCE_DIR="${2:-}"
      shift 2
      ;;
    --skip-start)
      SKIP_START="1"
      shift
      ;;
    --skip-system-install)
      SKIP_SYSTEM_INSTALL="1"
      shift
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if need_cmd sudo; then
    SUDO="sudo"
  else
    fail "Run as root or install sudo."
  fi
fi

if [ "${SKIP_SYSTEM_INSTALL}" = "1" ]; then
  SUDO=""
fi

install_base_packages() {
  if need_cmd apt-get; then
    $SUDO apt-get update
    $SUDO apt-get install -y ca-certificates curl tar python3
    return
  fi

  if need_cmd dnf; then
    $SUDO dnf install -y ca-certificates curl tar python3
    return
  fi

  if need_cmd yum; then
    $SUDO yum install -y ca-certificates curl tar python3
    return
  fi

  fail "Unsupported Linux distribution. Install curl, tar and python3 manually."
}

install_docker() {
  if need_cmd docker; then
    return
  fi

  log "Installing Docker Engine"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker
}

install_compose_plugin() {
  if docker_compose version >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker Compose plugin"
  local version="v2.39.4"
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  $SUDO mkdir -p /usr/local/lib/docker/cli-plugins
  $SUDO curl -fsSL \
    "https://github.com/docker/compose/releases/download/${version}/docker-compose-${os}-${arch}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  $SUDO chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
}

generate_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

detect_server_ip() {
  if need_cmd curl; then
    SERVER_IP="$(curl -fsSL https://api64.ipify.org || true)"
  fi

  if [ -z "${SERVER_IP}" ] && need_cmd hostname; then
    SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
}

copy_source_tree() {
  local source_dir="$1"
  local install_dir="$2"

  [ -d "${source_dir}" ] || fail "Source directory does not exist: ${source_dir}"

  log "Copying source tree from ${source_dir} to ${install_dir}"
  tar \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude=".next" \
    --exclude="runtime" \
    --exclude="output" \
    --exclude=".playwright-cli" \
    -C "${source_dir}" \
    -cf - . | tar -C "${install_dir}" -xf -
}

download_archive() {
  local archive_url="$1"
  local install_dir="$2"
  local tmp_dir archive_path
  tmp_dir="$(mktemp -d)"
  archive_path="${tmp_dir}/selfchecks-bootstrap.tar.gz"

  [ -n "${archive_url}" ] || fail "Set --source-dir for local installs or --archive-url for release installs."

  log "Downloading bootstrap archive"
  curl -fsSL "${archive_url}" -o "${archive_path}"
  tar -xzf "${archive_path}" --strip-components=1 -C "${install_dir}"
  rm -rf "${tmp_dir}"
}

seed_runtime_files() {
  local install_dir="$1"

  mkdir -p \
    "${install_dir}/runtime" \
    "${install_dir}/runtime/artifacts" \
    "${install_dir}/runtime/caddy-data" \
    "${install_dir}/runtime/caddy-config" \
    "${install_dir}/runtime/logs"

  if [ ! -f "${install_dir}/runtime/selfchecks.config.json" ]; then
    cp "${install_dir}/bootstrap/selfchecks.config.template.json" \
      "${install_dir}/runtime/selfchecks.config.json"
    chmod 600 "${install_dir}/runtime/selfchecks.config.json"
  fi

  if [ ! -f "${install_dir}/runtime/Caddyfile" ]; then
    cp "${install_dir}/bootstrap/Caddyfile.template" "${install_dir}/runtime/Caddyfile"
    chmod 600 "${install_dir}/runtime/Caddyfile"
  fi
}

write_env_file() {
  local install_dir="$1"

  if [ -f "${install_dir}/.env" ]; then
    return
  fi

  local nextauth_secret setup_token postgres_password
  nextauth_secret="$(generate_secret)"
  setup_token="$(generate_secret)"
  postgres_password="$(generate_secret)"

  cat > "${install_dir}/.env" <<EOF
NEXTAUTH_SECRET=${nextauth_secret}
SELFCHECKS_SETUP_TOKEN=${setup_token}

POSTGRES_DB=selfchecks
POSTGRES_USER=selfchecks
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=postgresql://selfchecks:${postgres_password}@postgres:5432/selfchecks?schema=public
SELFCHECKS_AUTO_MIGRATE=1

REDIS_HOST=redis
REDIS_PORT=6379
SELFCHECKS_QUEUE_NAME=selfchecks-checks
SELFCHECKS_CHECKS_ROOT=
SELFCHECKS_QUEUED_RUN_TIMEOUT_MINUTES=30
SELFCHECKS_RUNNING_RUN_TIMEOUT_MINUTES=120
SELFCHECKS_SCHEDULER_ENABLED=1
SELFCHECKS_SCHEDULER_INTERVAL_MS=60000
SELFCHECKS_SCHEDULER_REPORTER=list

SELFCHECKS_CONFIG_PATH=/app/runtime/selfchecks.config.json
SELFCHECKS_CADDY_CONFIG_PATH=/app/runtime/Caddyfile
SELFCHECKS_CADDY_ADMIN_URL=http://caddy:2019
SELFCHECKS_CADDY_UPSTREAM=web:3000
SELFCHECKS_ARTIFACTS_DIR=/app/runtime/artifacts
SELFCHECKS_WEBHOOK_TIMEOUT_MS=5000
EOF

  chmod 600 "${install_dir}/.env"
  log "Created ${install_dir}/.env"
}

if [ "${SKIP_SYSTEM_INSTALL}" = "1" ]; then
  log "Skipping OS package and Docker installation"
else
  install_base_packages
  install_docker
  install_compose_plugin
fi

detect_server_ip

$SUDO mkdir -p "${INSTALL_DIR}"
$SUDO chown "$(id -u):$(id -g)" "${INSTALL_DIR}"

if [ -n "${SOURCE_DIR}" ]; then
  copy_source_tree "${SOURCE_DIR}" "${INSTALL_DIR}"
else
  download_archive "${ARCHIVE_URL}" "${INSTALL_DIR}"
fi

seed_runtime_files "${INSTALL_DIR}"
write_env_file "${INSTALL_DIR}"

if [ "${SKIP_START}" = "1" ]; then
  log "Install files are ready in ${INSTALL_DIR}."
  log "Start manually with:"
  log "  docker compose --env-file .env -f docker-compose.prod.yml pull"
  log "  docker compose --env-file .env -f docker-compose.prod.yml up --force-recreate --abort-on-container-exit --exit-code-from migrate migrate"
  log "  docker compose --env-file .env -f docker-compose.prod.yml up -d"
  exit 0
fi

log "Starting selfchecks stack"
cd "${INSTALL_DIR}"
docker_compose --env-file .env -f docker-compose.prod.yml pull
docker_compose --env-file .env -f docker-compose.prod.yml up --force-recreate --abort-on-container-exit --exit-code-from migrate migrate
docker_compose --env-file .env -f docker-compose.prod.yml up -d

log "Install complete"
printf '\n'
if [ -n "${SERVER_IP}" ]; then
  printf 'Open http://%s/setup to finish first launch.\n' "${SERVER_IP}"
else
  printf 'Open http://<server-ip>/setup to finish first launch.\n'
fi
printf 'Setup token: %s\n' "$(grep '^SELFCHECKS_SETUP_TOKEN=' "${INSTALL_DIR}/.env" | cut -d= -f2-)"
printf 'After setup, Caddy will reload and request a certificate for the configured domain.\n'
