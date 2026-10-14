#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p artifacts
worker_pid=''
realtime_pid=''
web_pid=''
worker_start=''
realtime_start=''
web_start=''
normal_game_reached=false
normal_observer_reached=false
if [[ "${DARTSPOINT_QA_INPUT_DIAGNOSTIC:-false}" == true ]]; then
  case "${DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET:-game}" in
    game|observer) ;;
    *) printf '%s\n' 'QA input diagnostic refused: invalid_target' >&2; exit 1 ;;
  esac
fi
process_identity() {
  local pid="$1" stat_line
  local -a stat_fields
  [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/stat" ]] || return 1
  IFS= read -r stat_line < "/proc/$pid/stat" || return 1
  # The comm field may contain spaces or parentheses. All later fields are fixed.
  read -r -a stat_fields <<< "${stat_line##*) }"
  [[ "${#stat_fields[@]}" -ge 20 && "${stat_fields[1]}" == "$$" \
     && "${stat_fields[19]}" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "${stat_fields[19]}"
}
owned_child_running() {
  local pid="$1" expected="$2" observed
  [[ -n "$expected" ]] || return 1
  observed=$(process_identity "$pid") || return 1
  [[ "$observed" == "$expected" ]]
}
cleanup_owned_services() {
  result=$?
  trap - EXIT
  local index pid start
  local -a child_pids=("$web_pid" "$realtime_pid" "$worker_pid")
  local -a child_starts=("$web_start" "$realtime_start" "$worker_start")
  # Separate opt-in diagnostics run after the normal suite stops, while the
  # three exact native children and disposable database are still available.
  if [[ "${DARTSPOINT_QA_INPUT_DIAGNOSTIC:-false}" == true \
        && "${DARTSPOINT_QA_RUNNER:-false}" == true && "$normal_game_reached" == true \
        && ( "${DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET:-game}" == game \
             || ( "${DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET:-game}" == observer && "$normal_observer_reached" == true ) ) ]] \
      && owned_child_running "$web_pid" "$web_start" \
      && owned_child_running "$realtime_pid" "$realtime_start" \
      && owned_child_running "$worker_pid" "$worker_start"; then
    if ! DARTSPOINT_QA_INPUT_NORMAL_EXIT_CODE="$result" DARTSPOINT_QA_INPUT_NORMAL_GAME_REACHED=true \
      DARTSPOINT_QA_INPUT_NORMAL_OBSERVER_REACHED="$normal_observer_reached" \
      python3 scripts/qa-input-diagnostic.py; then
      if [[ "$result" == 0 ]]; then result=1; fi
    fi
  fi
  for index in "${!child_pids[@]}"; do
    pid="${child_pids[$index]}"; start="${child_starts[$index]}"
    if owned_child_running "$pid" "$start"; then kill "$pid" 2>/dev/null || true; fi
  done
  # Drain only the three native children this script started, then bound shutdown.
  for _ in {1..50}; do
    running=false
    for index in "${!child_pids[@]}"; do
      pid="${child_pids[$index]}"; start="${child_starts[$index]}"
      if owned_child_running "$pid" "$start"; then running=true; fi
    done
    if [[ "$running" == false ]]; then break; fi
    sleep 0.1
  done
  for index in "${!child_pids[@]}"; do
    pid="${child_pids[$index]}"; start="${child_starts[$index]}"
    if [[ -n "$pid" ]]; then
      if owned_child_running "$pid" "$start"; then kill -KILL "$pid" 2>/dev/null || true; fi
      wait "$pid" 2>/dev/null || true
    fi
  done
  # Successful CI still needs this database for the following real TLS/restore
  # step. The workflow's always() cleanup removes it after that step and upload.
  if [[ "${DARTSPOINT_QA_RUNNER:-false}" == true && "$result" != 0 ]]; then
    if ! python3 scripts/qa-runner-context.py cleanup; then
      if [[ "$result" == 0 ]]; then result=1; fi
    fi
  fi
  exit "$result"
}
trap cleanup_owned_services EXIT
# Both routes use disposable local provider credentials, never Environment secrets.
if [[ "${DARTSPOINT_QA_RUNNER:-false}" == true ]]; then
  python3 scripts/qa-runner-context.py preclean
  python3 scripts/qa-runner-context.py prepare-template
fi
# CLI 2.109.1 names the unused Storage API service "storage". Auth, PostgreSQL,
# PostgREST, Kong and mail remain present for the same real acceptance checks.
node_modules/.bin/supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage >artifacts/supabase-start-private.log 2>&1
python3 scripts/bind-local-services.py
node scripts/configure-local.mjs
if [[ "${DARTSPOINT_QA_RUNNER:-false}" == true ]]; then
  python3 scripts/qa-runner-context.py template-probe
fi
# Build with the actual local public configuration and exercise the production
# server. Cold development compilation must not consume a player's turn clock.
node --env-file=.env.local scripts/build-deploy.mjs >artifacts/acceptance-build-private.log 2>&1
redis_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["REDIS_IMAGE"])')
docker run -d --name dartspoint-development-redis \
  --label io.dartspoint.qa.project=dartspoint-development --label io.dartspoint.qa.resource=redis \
  --publish 127.0.0.1:62479:6379 "$redis_image" redis-server --appendonly yes >/dev/null
postgres_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["POSTGRES_IMAGE"])')
docker pull "$postgres_image" >artifacts/restore-image.log 2>&1
if [[ "${DARTSPOINT_QA_RUNNER:-false}" == true ]]; then
  # The operator installs OS libraries once. A CI job never receives sudo/apt.
  node_modules/.bin/playwright install chromium >artifacts/browser-install.log 2>&1
  python3 scripts/qa-runner-context.py browser-check
else
  node_modules/.bin/playwright install --with-deps chromium >artifacts/browser-install.log 2>&1
fi
# Exercise the same ESM service artifacts copied into the deployment images.
test -s dist/deploy/worker/server.js
test -s dist/deploy/realtime/server.js
node --env-file=.env.local dist/deploy/worker/server.js >artifacts/worker-private.log 2>&1 &
worker_pid=$!
worker_start=$(process_identity "$worker_pid" || true)
node --env-file=.env.local dist/deploy/realtime/server.js >artifacts/realtime-private.log 2>&1 &
realtime_pid=$!
realtime_start=$(process_identity "$realtime_pid" || true)
HOSTNAME=127.0.0.1 PORT=4300 node --env-file=.env.local dist/deploy/web/apps/web/server.js >artifacts/web-private.log 2>&1 &
web_pid=$!
web_start=$(process_identity "$web_pid" || true)
node --env-file=.env.local scripts/wait-local.mjs
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts create >artifacts/public-launch-probe-create.json
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts check >artifacts/public-launch-probe-check.json
cmp artifacts/public-launch-probe-create.json artifacts/public-launch-probe-check.json
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts remove >artifacts/public-launch-probe-remove.json
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/unit/domain.test.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/multiplayer.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/practice.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/practice-preset-keyboard.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/practice-auth-outage.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/services.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/update-2026-10-13.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-moderation.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-projection.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/player-visibility.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-send-batching.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/render-sample-timing.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/match-room-expansion.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/competitions.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/restore.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/drain.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/recovery.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/owner.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/load.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/mail.ts
# Preserve independent throwing evidence before the broader workspace checks.
normal_game_reached=true
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/game-timing.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/render-sample-timing.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/visual.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/chat-moderation-ui.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/auth.ts

node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/interface.ts

python3 tests/integration/https-proxy.py

node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/update-2026-10-13.ts
python3 tests/integration/landing-proxy.py

node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/chat-read.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/workspace-chat.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/workspace-density.ts
normal_observer_reached=true
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/match-room-expansion.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/room-activity.ts
