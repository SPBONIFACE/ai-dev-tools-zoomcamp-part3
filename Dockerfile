# ==========================================
# STAGE 1: Build Frontend
# ==========================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml* frontend/bun.lock* ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
ENV NITRO_PRESET=node-server
RUN npm run build

# ==========================================
# STAGE 2: Unified Python + Node Production Image
# ==========================================
FROM python:3.13-slim

# Install system utilities and Node.js runtime for the SSR server
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reliable Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy backend application source and install Python dependencies
COPY backend/ ./backend/
RUN cd backend && uv sync

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/frontend/.output ./frontend/.output

# Copy launch script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

ENV PORT=8000
EXPOSE 8000

CMD ["./start.sh"]
