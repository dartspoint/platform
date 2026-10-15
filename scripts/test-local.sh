#!/usr/bin/env bash
set -euo pipefail
node --env-file=.env.local scripts/wait-local.mjs
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/test-legal-setup.ts
npm run verify:ci
node scripts/check-original-rules.mjs
python3 scripts/check-source-parity.py
python3 tests/ops/test_privacy_backups.py
for test in legal support privacy-erasure privacy privacy-deadlines retention services update-2026-10-13 chat-moderation chat-projection render-sample-timing match-room-expansion competitions recovery owner restore drain load mail; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/integration/$test.ts"
done
for test in multiplayer practice practice-preset-keyboard practice-auth-outage visual chat-moderation-ui turnstile auth interface update-2026-10-13 chat-read workspace-chat game-timing render-sample-timing match-room-expansion room-activity documents-support documents-support-delivery; do
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs "tests/e2e/$test.ts"
done
