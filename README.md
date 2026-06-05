# Trajectory Runtime

Executes Trajectory distributed-workflow packages. Ships two parity-checked engines — `engines/web` (TypeScript reference + web product) and `engines/kmp-engine` (Kotlin Multiplatform, native) — plus a web runtime UI (`engines/web-ui`) and an Android app (`engines/android-app`).

> **PLEASE NOTE:** Trajectory is a demonstration system, not intended for production environments. The editor and runtime are single-user systems and do not have the security necessary for production use. We recommend loading the applications into a Docker container for your testing.

## Quick start (Docker)

See [`DOCKER-README.md`](./DOCKER-README.md). To run the whole suite together, use the umbrella `docker compose up --build`.

## Development

```bash
# Runtime web UI
cd engines/web-ui && npm install && npm run dev

# Reference engine (Node test runner)
cd engines/web && npm install && npm test
```

Requires Node 22+. The Kotlin engine builds via Gradle (`./gradlew.bat :jvmTest` in `engines/kmp-engine`).

## Documentation

- Workflow schema: [`SCHEMA-SPECIFICATION.md`](./SCHEMA-SPECIFICATION.md)
- Docker: [`DOCKER-README.md`](./DOCKER-README.md)

## License

Apache-2.0 © 2026 Dennis Brandl. See [`LICENSE`](./LICENSE).
