#!/usr/bin/env bash
# Starts the local stack: MariaDB (docker), the Nest API (:4100, watch mode)
# and the Vite dev server (:5180). Ctrl+C stops the API and web servers.
set -euo pipefail
cd "$(dirname "$0")"

docker compose up -d db >/dev/null

# Ignore any inherited PORT (tools often set it for the web server); the API
# takes its port from backend/.env.
env -u PORT npm --prefix backend run start:dev &
# Stop the API and its watch-mode children with the rest of the process group.
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null' EXIT INT TERM

npm --prefix frontend run dev
