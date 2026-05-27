# =============================================================================
# Trajectory Runtime — Production Docker Image
#
# Workflow runtime execution engine with React web UI.
# Multi-stage build: compile TypeScript engine + build Vite frontend,
# then serve static assets with nginx.
#
# Prerequisites:
#   - Docker Desktop installed and running
#
# Quick Start:
#   docker compose up --build -d
#   Open http://localhost:3001
#
# Manual Build & Run:
#   docker build -t trajectoryruntime .
#   docker run -d -p 3001:80 trajectoryruntime
#
# Architecture:
#   This image builds two packages:
#   1. engines/web      — TypeScript workflow engine library
#   2. engines/web-ui   — React 19 frontend (Vite)
#
#   The KMP (Kotlin Multiplatform) engine is stubbed out for the web
#   build. It is used separately for Android/iOS native builds.
#
#   The final image serves the static frontend via nginx (~30MB).
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files for both web engine and web-ui (cached layer)
COPY engines/web/package.json engines/web/package-lock.json* engines/web/
COPY engines/web-ui/package.json engines/web-ui/package-lock.json* engines/web-ui/

# Install dependencies
RUN cd engines/web && npm install
RUN cd engines/web-ui && npm install

# Copy source files needed for the build
COPY engines/web/ engines/web/
COPY engines/web-ui/ engines/web-ui/
COPY spec/ spec/
COPY schemas/ schemas/

# Build the web engine library (tsc → dist/)
RUN cd engines/web && npm run build

# Create KMP engine stub (full Kotlin build not needed for web;
# the KMP engine is used for Android/iOS native builds)
RUN mkdir -p engines/kmp-engine/build/dist/js/productionLibrary && \
    echo "export default {};" > engines/kmp-engine/build/dist/js/productionLibrary/kmp-engine.js

# Build the web-ui (tsc + vite → dist/)
RUN cd engines/web-ui && npm run build

# ---------------------------------------------------------------------------
# Stage 2: Serve with nginx
# ---------------------------------------------------------------------------
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/engines/web-ui/dist /usr/share/nginx/html

# SPA routing: serve index.html for all client-side routes
RUN printf 'server {\n\
    listen 80;\n\
    server_name localhost;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
