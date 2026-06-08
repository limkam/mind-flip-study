#!/usr/bin/env bash
# Raise open-file limit for Metro (avoids EMFILE on Linux when watchman is not installed).
set -e
cd "$(dirname "$0")/.."
ulimit -n 65536 2>/dev/null || ulimit -n 8192 2>/dev/null || true
exec npx expo start "$@"
