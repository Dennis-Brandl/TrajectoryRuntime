# Trajectory Runtime — Docker Deployment Guide

Trajectory Runtime (the client-side workflow execution engine + web UI) can run two ways: in a Docker container, or rebuilt locally from source.

## Run with Docker

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (Engine or Desktop)

### Quick Start
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

### Remote / Network Access
1. Open the firewall port (Windows — run as Administrator):
   ```powershell
   New-NetFirewallRule -DisplayName "TrajectoryRuntime (TCP 3001)" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
   ```
2. Access from other machines at `http://<server-ip>:3001`.

### Common Commands
```bash
docker compose up --build -d    # Build and start
docker compose up -d            # Start (already built)
docker compose down             # Stop
docker compose logs -f          # View live logs
docker compose ps               # Check status
```

## Architecture
Trajectory Runtime is a client-side web application:
- **engines/web** — TypeScript workflow engine library (compiled during build)
- **engines/web-ui** — React 19 frontend built with Vite
- **nginx** — serves the static production bundle (~30 MB image)

No database or backend server is required. Workflow packages (`.WFmasterX` files) are loaded and executed entirely in the browser. The Kotlin Multiplatform (KMP) engine is stubbed during the web build; it is used separately for Android/iOS native builds.

## Rebuild locally (without Docker)

### Prerequisites
- Node.js 20+

### Steps
```bash
cd engines/web-ui
npm install
npm run dev        # Vite dev server on http://localhost:5173
```
For a production build: run `npm run build` in `engines/web-ui` (output in `engines/web-ui/dist/`).

## Running the whole Trajectory platform together
To run all the apps at once (Editor, Runtime, Action Container, Action Tester), use the root `docker-compose.yml` in the directory that holds the repos as siblings, and see its `DOCKER-README.md`.
