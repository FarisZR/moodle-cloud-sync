#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data/temp /app/data/logs

pnpm exec prisma db push

exec pnpm start
