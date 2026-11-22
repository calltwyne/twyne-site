#!/usr/bin/env sh
# Pull the latest published/saved project from Webstudio and regenerate the
# local code from it.
#
#   npm run sync
#
# 1. `webstudio sync` downloads the project into .webstudio/data.json.
# 2. `webstudio build --template ssg` regenerates app/__generated__/, pages/,
#    and downloads new assets into public/assets/.
#
# The build merges its template's package.json into ours, so the extra
# scripts here (sync, etc.) survive. scripts/ is never touched.
# Afterwards, review `git diff` and commit.
set -eu

cd "$(dirname "$0")/.."

if command -v webstudio >/dev/null 2>&1; then
  ws() { webstudio "$@"; }
else
  # Fall back to the CLI version matching the installed SDK.
  version=$(node -p "require('./package.json').dependencies['@webstudio-is/sdk']")
  ws() { npx -y "webstudio@$version" "$@"; }
fi

lock_before=$(cat package.json package-lock.json 2>/dev/null | cksum)

echo "==> Syncing project data from Webstudio"
ws sync

echo "==> Regenerating local code (ssg template)"
ws build --template ssg

if [ "$(cat package.json package-lock.json 2>/dev/null | cksum)" != "$lock_before" ]; then
  echo "==> package.json changed; installing dependencies"
  npm install
fi

echo
echo "==> Changes from Webstudio:"
git status --short
