#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${APP_URL:-}" ]]; then
  echo "Set APP_URL to the Preview or Production deployment origin." >&2
  exit 1
fi

app_url="${APP_URL%/}"
status_dir="$(mktemp -d)"
trap 'rm -rf "$status_dir"' EXIT

check_burst() {
  local rule_name="$1"
  local path="$2"
  local requests="$3"
  local payload="$4"
  local attempt
  local rate_limited_count

  for ((attempt = 1; attempt <= requests; attempt += 1)); do
    curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
      -X POST \
      -H 'Content-Type: application/json' \
      --data "$payload" \
      "${app_url}${path}" >"${status_dir}/${rule_name}-${attempt}.status" &
  done
  wait

  rate_limited_count="$(awk '$0 == "429" { count += 1 } END { print count + 0 }' "${status_dir}/${rule_name}-"*.status)"
  if [[ "$rate_limited_count" == "0" ]]; then
    echo "${rule_name}: expected at least one 429 after ${requests} requests." >&2
    return 1
  fi

  echo "${rule_name}: verified (${rate_limited_count} rate-limited responses)."
}

check_burst room-create /api/multiplayer/rooms 11 '{"seed":10000}' &
create_pid=$!
check_burst room-join /api/multiplayer/rooms/join 21 '{"code":"INVALID"}' &
join_pid=$!
check_burst handshake /api/multiplayer/handshake 61 '{}' &
handshake_pid=$!
check_burst peer-credentials /api/multiplayer/peer-credentials 121 '{}' &
credentials_pid=$!

failed=0
for pid in "$create_pid" "$join_pid" "$handshake_pid" "$credentials_pid"; do
  if ! wait "$pid"; then failed=1; fi
done
exit "$failed"
