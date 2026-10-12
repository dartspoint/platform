#!/usr/bin/env bash
set -euo pipefail
node --env-file=.env.local scripts/wait-local.mjs
npm run verify:ci
node scripts/check-original-rules.mjs
python3 scripts/check-source-parity.py
for test in services competitions recovery owner restore drain load mail; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/integration/$test.ts"
done
for test in multiplayer practice visual auth interface; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/e2e/$test.ts"
done
