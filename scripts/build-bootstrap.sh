#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-${REPOSITORY_ROOT}/output/bootstrap}"

if [[ "${OUTPUT_DIR}" != /* ]]; then
  OUTPUT_DIR="${REPOSITORY_ROOT}/${OUTPUT_DIR}"
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

BUNDLE_DIR="${TEMP_DIR}/selfchecks-bootstrap"
mkdir -p "${OUTPUT_DIR}" "${BUNDLE_DIR}/bootstrap" "${BUNDLE_DIR}/scripts"

install -m 0644 \
  "${REPOSITORY_ROOT}/docker-compose.prod.yml" \
  "${BUNDLE_DIR}/docker-compose.prod.yml"
install -m 0644 \
  "${REPOSITORY_ROOT}/bootstrap/Caddyfile.template" \
  "${BUNDLE_DIR}/bootstrap/Caddyfile.template"
install -m 0644 \
  "${REPOSITORY_ROOT}/bootstrap/selfchecks.config.template.json" \
  "${BUNDLE_DIR}/bootstrap/selfchecks.config.template.json"
install -m 0755 \
  "${REPOSITORY_ROOT}/scripts/install-selfchecks.sh" \
  "${BUNDLE_DIR}/scripts/install-selfchecks.sh"

install -m 0755 \
  "${REPOSITORY_ROOT}/scripts/install-selfchecks.sh" \
  "${OUTPUT_DIR}/bootstrap.sh"

tar -czf "${OUTPUT_DIR}/selfchecks-bootstrap.tar.gz" \
  -C "${TEMP_DIR}" selfchecks-bootstrap

printf 'Created %s and %s\n' \
  "${OUTPUT_DIR}/bootstrap.sh" \
  "${OUTPUT_DIR}/selfchecks-bootstrap.tar.gz"
