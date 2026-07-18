# AVM

AVM is the Agnostic Agent Virtual Machine workspace:

- **KADMOS**: deterministic PHP core and operator CLI.
- **Validator**: stateless Node/Fastify service for JMP validation.
- **TALOS**: authenticated Laravel/Vue control plane and product UI.

## Quick Start

The adaptive container runtime starts from a clean checkout:

```bash
git clone https://github.com/Ninozzz95/agent-virtual-machine.git
cd agent-virtual-machine
./talos up
```

Run the bootstrap only from a trusted checkout. TALOS verifies every downloaded
runtime artifact and protects the approved inputs across UAC, but source mode
intentionally treats the cloned repository itself as the trust root.

On Windows Command Prompt use `talos.cmd up`. No manual Docker or Podman installation is required
on supported Windows hosts. A healthy existing Docker
installation remains preferred; otherwise supported Windows workstations use
the pinned Docker Desktop bootstrap. Windows Server uses Podman Machine with Hyper-V;
the first run may request UAC elevation and one Windows restart, then the same
command resumes setup.

The launcher creates `.env`, generates internal credentials, installs verified
runtime artifacts under the ignored `.tools/` directory when needed, builds the
complete stack, runs migrations, and fails with diagnostics if runtime,
validator, or launchable-Chromium readiness does not pass. On macOS and Linux,
install a compatible Docker or Podman runtime before running the command.

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

## Native Development

From Git Bash on Windows:

```bash
./talos dev
```

The first run downloads pinned PHP, Composer, and Node archives into the ignored
`.tools/` directory, verifies their SHA-256 digests, installs locked project
dependencies and the actual Chromium executable, prepares SQLite, runs
migrations, and starts Laravel, the queue, Vite, the validator, and the browser
worker. The toolchain is relocatable and does not depend on the checkout
directory name.

Repair or inspect a native checkout with:

```bash
./talos doctor
./talos doctor --repair
```

## Operator CLI

KADMOS runs from `core/`:

```bash
./talos doctor --repair
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
cd ../browser-worker && ../.tools/bin/npm.cmd test && ../.tools/bin/npm.cmd run build
cd ../control-plane && ../.tools/bin/php.cmd artisan test && ../.tools/bin/npm.cmd run build
```

Never commit `.env`, uploaded files, logs, databases, provider keys, or generated
private artifacts.
