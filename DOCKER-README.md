# Trajectory RT — Docker Deployment Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/Dennis-Brandl/TrajectoryRuntime.git
   cd TrajectoryRuntime
   ```

2. Build and start:
   ```bash
   docker compose up --build -d
   ```

3. Open http://localhost:3001

## Remote / Network Access

To allow access from other machines on your network:

1. Open firewall ports (Windows — run as Administrator):
   ```powershell
   New-NetFirewallRule -DisplayName "TrajectoryRuntime (TCP 3001)" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
   ```

2. Access from other machines at `http://<server-ip>:3001`

## Architecture

Trajectory RT is a client-side web application:

- **engines/web** — TypeScript workflow engine library (compiled during build)
- **engines/web-ui** — React 19 frontend built with Vite
- **nginx** — Serves the static production bundle (~30MB image)

No database or backend server is required. Workflow packages (`.WFmasterX` files) are loaded and executed entirely in the browser.

The Kotlin Multiplatform (KMP) engine is stubbed during the web build. It is used separately for Android and iOS native builds.

## Common Commands

```bash
docker compose up --build -d    # Build and start
docker compose up -d            # Start (already built)
docker compose down             # Stop
docker compose logs -f          # View live logs
docker compose ps               # Check status
```

## Running Both Trajectory Apps Together

To run Trajectory MD and Trajectory RT side by side, create a `docker-compose.yml` in a parent directory:

```yaml
services:
  trajectoryeditor:
    build: ./TrajectoryEditor
    ports:
      - "3000:3000"
    volumes:
      - trajectoryeditor-data:/data
    environment:
      - NODE_ENV=production
      - BETTER_AUTH_SECRET=<your-secret-here>
      - ALLOWED_ORIGINS=http://<your-ip>:3000
    restart: unless-stopped

  trajectoryruntime:
    build: ./TrajectoryRuntime
    ports:
      - "3001:80"
    restart: unless-stopped

volumes:
  trajectoryeditor-data:
```
