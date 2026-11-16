#!/usr/bin/env bash
set -euo pipefail

version="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")"
package_root="$(mktemp -d)"
trap 'rm -rf "$package_root"' EXIT

python3 -m zipfile -e "dist/CaptureSok-${version}.zip" "$package_root"
CAPTURESOK_PACKAGE_ROOT="$package_root" node scripts/package-smoke.mjs
