#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DIRECT_URL:?DIRECT_URL is required}"

echo "Starting Gestor API"
exec "$@"
