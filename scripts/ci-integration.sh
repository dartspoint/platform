#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p artifacts
# Hosted runner only: isolated default local provider credentials, never Environment secrets.
node_modules/.bin/supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor >artifacts/supabase-start-private.log 2>&1
python3 scripts/bind-local-services.py
node scripts/configure-local.mjs
# Build with the actual local public configuration and exercise the production
# server. Cold development compilation must not consume a player's turn clock.
node --env-file=.env.local scripts/build-deploy.mjs >artifacts/acceptance-build-private.log 2>&1
redis_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["REDIS_IMAGE"])')
docker run -d --name dartspoint-development-redis --publish 127.0.0.1:62479:6379 "$redis_image" redis-server --appendonly yes >/dev/null
postgres_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["POSTGRES_IMAGE"])')
docker pull "$postgres_image" >artifacts/restore-image.log 2>&1
node_modules/.bin/playwright install --with-deps chromium >artifacts/browser-install.log 2>&1
node --env-file=.env.local node_modules/tsx/dist/cli.mjs apps/worker/src/worker.ts >artifacts/worker-private.log 2>&1 &
worker_pid=$!
node --env-file=.env.local node_modules/tsx/dist/cli.mjs apps/realtime/src/server.ts >artifacts/realtime-private.log 2>&1 &
realtime_pid=$!
HOSTNAME=127.0.0.1 PORT=4300 node --env-file=.env.local dist/deploy/web/apps/web/server.js >artifacts/web-private.log 2>&1 &
web_pid=$!
trap 'kill "$web_pid" "$realtime_pid" "$worker_pid" 2>/dev/null || true' EXIT
node --env-file=.env.local scripts/wait-local.mjs
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts create >artifacts/public-launch-probe-create.json
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts check >artifacts/public-launch-probe-check.json
cmp artifacts/public-launch-probe-create.json artifacts/public-launch-probe-check.json
RELEASE_SHA=0000000000000000000000000000000000000001 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-launch-storage.ts remove >artifacts/public-launch-probe-remove.json
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/unit/domain.test.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/multiplayer.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/practice.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/services.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/update-2026-10-13.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-moderation.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-projection.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/player-visibility.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/chat-send-batching.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/render-sample-timing.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/competitions.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/restore.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/drain.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/recovery.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/owner.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/load.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/mail.ts
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

node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/game-timing.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/render-sample-timing.ts
