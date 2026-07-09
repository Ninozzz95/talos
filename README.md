# AVM

AVM is the Agnostic Agent Virtual Machine workspace:

- **KADMOS**: deterministic PHP core and operator CLI.
- **Validator**: stateless Node/Fastify service for JMP validation.
- **TALOS**: authenticated Laravel/Vue control plane and product UI.

## Quick Start

Docker-first local/private start:

```bash
cp .env.example .env
./talos up
```

Open:

```text
http://localhost:8088/
```

If no admin exists, TALOS opens first-run setup. If `TALOS_ADMIN_EMAIL` and
`TALOS_ADMIN_PASSWORD` are set in `.env` before first boot, the first admin is
created from environment.

The first interactive `talos` command shows a short TALOS bootstrap sequence.
For CI, scripts, or plain logs use:

```bash
TALOS_NO_BOOT=1 ./talos up
./talos up --no-boot
```

## Operator CLI

KADMOS runs from `core/`:

```bash
cd core
../.tools/bin/php.cmd kadmos
../.tools/bin/php.cmd kadmos doctor --json
```

## Documentation

- [Official docs index](docs/README.md)
- [Deployment plans and procedures](docs/deployment.md)
- [Architecture overview](docs/architecture/overview.md)
- [Security model](docs/architecture/security-model.md)
- [Benchmark methodology](docs/benchmarks/methodology.md)

## Development Verification

```bash
cd core && ../.tools/bin/php.cmd kadmos test
cd ../validator && ../.tools/bin/npm.cmd test && ../.tools/bin/npm.cmd run build
cd ../control-plane && ../.tools/bin/php.cmd artisan test && ../.tools/bin/npm.cmd run build
```

Never commit `.env`, uploaded files, logs, databases, provider keys, or generated
private artifacts.
