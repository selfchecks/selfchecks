#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-${REPOSITORY_ROOT}/output/bootstrap}"

if [[ "${ARTIFACT_DIR}" != /* ]]; then
  ARTIFACT_DIR="${REPOSITORY_ROOT}/${ARTIFACT_DIR}"
fi

BOOTSTRAP_PATH="${ARTIFACT_DIR}/bootstrap.sh"
ARCHIVE_PATH="${ARTIFACT_DIR}/selfchecks-bootstrap.tar.gz"

test -x "${BOOTSTRAP_PATH}"
test -f "${ARCHIVE_PATH}"
bash -n "${BOOTSTRAP_PATH}"
grep -Fq \
  'DEFAULT_ARCHIVE_URL="https://github.com/selfchecks/selfchecks/releases/download/bootstrap/selfchecks-bootstrap.tar.gz"' \
  "${BOOTSTRAP_PATH}"

ARCHIVE_CONTENTS="$(tar -tzf "${ARCHIVE_PATH}")"
for expected_path in \
  selfchecks-bootstrap/docker-compose.prod.yml \
  selfchecks-bootstrap/bootstrap/Caddyfile.template \
  selfchecks-bootstrap/bootstrap/selfchecks.config.template.json \
  selfchecks-bootstrap/scripts/install-selfchecks.sh; do
  grep -Fxq "${expected_path}" <<<"${ARCHIVE_CONTENTS}"
done

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT
INSTALL_DIR="${TEMP_DIR}/install"

SELFCHECKS_ARCHIVE_URL="file://${ARCHIVE_PATH}" \
SELFCHECKS_SERVER_IP="127.0.0.1" \
  bash "${BOOTSTRAP_PATH}" \
  --install-dir "${INSTALL_DIR}" \
  --skip-system-install \
  --skip-start

for installed_path in \
  docker-compose.prod.yml \
  bootstrap/Caddyfile.template \
  bootstrap/selfchecks.config.template.json \
  scripts/install-selfchecks.sh \
  runtime/Caddyfile \
  runtime/selfchecks.config.json \
  .env; do
  test -f "${INSTALL_DIR}/${installed_path}"
done

grep -q '^SELFCHECKS_SETUP_TOKEN=' "${INSTALL_DIR}/.env"
grep -q '^SELFCHECKS_API_TOKEN=' "${INSTALL_DIR}/.env"

printf 'Bootstrap smoke test passed\n'
