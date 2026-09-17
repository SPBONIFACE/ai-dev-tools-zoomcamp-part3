#!/bin/sh
set -e

echo "Starting frontend server on internal port 3000..."
PORT=3000 node /app/frontend/.output/server/index.mjs &

echo "Starting FastAPI backend on port ${PORT:-8000}..."
cd /app/backend
exec uv run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
