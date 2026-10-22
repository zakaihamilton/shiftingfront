#!/usr/bin/env bash
# Install Playwright's OS packages without letting a slow apt mirror use the
# whole CI job. GitHub-hosted Ubuntu tries azure.archive.ubuntu.com first. A
# degraded mirror can keep sending a few kilobytes at a time, so apt never
# fails over and the job is cancelled before the tests start. Each attempt is
# bounded. If the first one does not finish, later attempts use
# archive.ubuntu.com. Packages already fetched stay in the apt cache.

set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "usage: playwright-system-deps.sh <browser>..." >&2
  exit 2
fi

attempt_seconds="${PLAYWRIGHT_DEPS_ATTEMPT_SECONDS:-240}"
locks=(
  /var/lib/apt/lists/lock
  /var/cache/apt/archives/lock
  /var/lib/dpkg/lock
  /var/lib/dpkg/lock-frontend
)

printf '%s\n' \
  'Acquire::Retries "2";' \
  'Acquire::http::Timeout "30";' \
  'Acquire::https::Timeout "30";' \
  | sudo tee /etc/apt/apt.conf.d/80-ci-playwright-timeouts >/dev/null

prefer_canonical_archive() {
  local mirrors=/etc/apt/apt-mirrors.txt
  if [[ -f "$mirrors" ]] && sudo grep -q 'archive\.ubuntu\.com' "$mirrors"; then
    sudo sed -i '/azure\.archive\.ubuntu\.com/d' "$mirrors"
  fi

  local sources=()
  local file
  [[ -f /etc/apt/sources.list ]] && sources+=(/etc/apt/sources.list)
  if [[ -d /etc/apt/sources.list.d ]]; then
    while IFS= read -r -d '' file; do
      sources+=("$file")
    done < <(find /etc/apt/sources.list.d -maxdepth 1 -type f -print0)
  fi
  if [[ "${#sources[@]}" -gt 0 ]]; then
    sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' "${sources[@]}"
  fi
}

lock_busy() {
  local lock="$1"
  [[ -e "$lock" ]] || return 1
  command -v fuser >/dev/null 2>&1 || return 1
  sudo fuser "$lock" >/dev/null 2>&1
}

wait_for_locks() {
  local deadline=$((SECONDS + 60))
  local lock
  while true; do
    local held=false
    for lock in "${locks[@]}"; do
      if lock_busy "$lock"; then
        held=true
        break
      fi
    done
    if [[ "$held" == false ]]; then
      return 0
    fi
    if [[ "$SECONDS" -ge "$deadline" ]]; then
      echo "::error::apt locks stayed held after stopping the install" >&2
      return 1
    fi
    echo "Waiting for apt locks..."
    sleep 2
  done
}

stop_orphaned_apt() {
  # playwright install-deps runs apt-get through sudo. timeout tears down the
  # pnpm process group, and a nested sudo can leave apt-get holding the lock.
  local existing=()
  local lock
  for lock in "${locks[@]}"; do
    [[ -e "$lock" ]] && existing+=("$lock")
  done
  if [[ "${#existing[@]}" -gt 0 ]] && command -v fuser >/dev/null 2>&1; then
    sudo fuser -k "${existing[@]}" >/dev/null 2>&1 || true
  fi
  sudo pkill -9 -x apt-get >/dev/null 2>&1 || true
  sudo pkill -9 -x dpkg >/dev/null 2>&1 || true
  sleep 1
  wait_for_locks
  sudo env DEBIAN_FRONTEND=noninteractive dpkg --configure -a || true
}

run_attempt() {
  local attempt="$1"
  shift
  echo "Installing Playwright system dependencies (attempt ${attempt})..."
  timeout --signal=TERM --kill-after=20 "$attempt_seconds" \
    pnpm exec playwright install-deps "$@"
}

if run_attempt 1 "$@"; then
  exit 0
fi

echo "::warning::Playwright system packages did not finish from the primary apt mirror; retrying via archive.ubuntu.com"
stop_orphaned_apt
prefer_canonical_archive

if run_attempt 2 "$@"; then
  exit 0
fi

echo "::error::Playwright system packages did not install" >&2
stop_orphaned_apt || true
exit 1
