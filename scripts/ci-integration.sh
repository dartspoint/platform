#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p artifacts
# Hosted runner only: isolated default local provider credentials, never Environment secrets.
node_modules/.bin/supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor >artifacts/supabase-start-private.log 2>&1
python3 scripts/bind-local-services.py
node scripts/configure-local.mjs
redis_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["REDIS_IMAGE"])')
docker run -d --name dartspoint-development-redis --publish 127.0.0.1:62479:6379 "$redis_image" redis-server --appendonly yes >/dev/null
postgres_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["POSTGRES_IMAGE"])')
docker pull "$postgres_image" >artifacts/restore-image.log 2>&1
node_modules/.bin/playwright install --with-deps chromium >artifacts/browser-install.log 2>&1
node --env-file=.env.local node_modules/tsx/dist/cli.mjs apps/worker/src/worker.ts >artifacts/worker-private.log 2>&1 &
worker_pid=$!
node --env-file=.env.local node_modules/tsx/dist/cli.mjs apps/realtime/src/server.ts >artifacts/realtime-private.log 2>&1 &
realtime_pid=$!
npm run dev:web >artifacts/web-private.log 2>&1 &
web_pid=$!
trap 'kill "$web_pid" "$realtime_pid" "$worker_pid" 2>/dev/null || true' EXIT
node --env-file=.env.local scripts/wait-local.mjs
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/unit/domain.test.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/multiplayer.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/practice.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/services.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/competitions.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/restore.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/drain.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/recovery.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/owner.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/load.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/mail.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/visual.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/auth.ts

node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/interface.ts

python3 tests/integration/https-proxy.py
