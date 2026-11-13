#!/usr/bin/env bash
set -euo pipefail
umask 077
# Keep the developer's optional review fixture separate from disposable suite data.
export BLOG_TEST_FIXTURE=artifacts/blog/suite-fixture.private.json
export BLOG_UI_FIXTURE="$BLOG_TEST_FIXTURE"
cleanup_blog_fixture() {
  local result=$?
  trap - EXIT
  if [[ -f "$BLOG_TEST_FIXTURE" ]]; then
    if ! node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/test-blog-fixture.ts --cleanup; then
      result=1
    fi
  fi
  exit "$result"
}
trap cleanup_blog_fixture EXIT
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/blog.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/test-blog-fixture.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/e2e/blog.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/blog-http.ts
