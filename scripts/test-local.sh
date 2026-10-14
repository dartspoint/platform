#!/usr/bin/env bash
set -euo pipefail
node --env-file=.env.local scripts/wait-local.mjs
npm run verify:ci
node scripts/check-original-rules.mjs
python3 scripts/check-source-parity.py
for test in services update-2026-10-13 chat-moderation chat-projection render-sample-timing match-room-expansion competitions recovery owner restore drain load mail; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/integration/$test.ts"
done
for test in multiplayer practice practice-preset-keyboard practice-auth-outage visual chat-moderation-ui auth interface update-2026-10-13 chat-read workspace-chat game-timing render-sample-timing match-room-expansion room-activity; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/e2e/$test.ts"
done
