#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data/temp /app/data/logs

./node_modules/.bin/prisma db push

exec ./node_modules/.bin/next start
