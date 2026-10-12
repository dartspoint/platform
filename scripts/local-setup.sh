#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p artifacts
node_modules/.bin/supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor >artifacts/supabase-start-private.log 2>&1
python3 scripts/bind-local-services.py
if [[ ! -f .env.local ]]; then node scripts/configure-local.mjs; else node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/migrate.ts --expand-only; fi
if ! docker container inspect dartspoint-development-redis >/dev/null 2>&1; then
  redis_image=$(python3 -c 'import json; print(json.load(open("ops/image-pins.json"))["REDIS_IMAGE"])')
  docker run -d --name dartspoint-development-redis --publish 127.0.0.1:62479:6379 "$redis_image" redis-server --appendonly yes >/dev/null
else
  docker start dartspoint-development-redis >/dev/null
fi
printf '%s\n' 'Local provider and schema ready. Start the application with npm run dev.'
