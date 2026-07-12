# TALOS and KADMOS Deployment Plans

This document defines the official development and production deployment plans
for the AVM workspace. It is intentionally split by product surface:

- TALOS is the authenticated web control plane and UI.
- KADMOS is the operator CLI for diagnostics, validation, evidence, benchmark,
  trace, and recovery workflows.

The repository supports two deployment paths:

- native development, useful while editing Laravel, Vue, the validator, and the
  PHP core;
- Docker-first deployment, useful for local demos and private production-like
  installs.

## Canonical Topology

```text
Browser
  -> TALOS Laravel control-plane
       -> SQLite/PostgreSQL database
       -> Laravel queue worker
       -> Node validator on private/internal URL
       -> PHP Kadmos core through Laravel/core integration points

Operator terminal
  -> KADMOS CLI
       -> local core commands
       -> validator health/validation
       -> TALOS control-plane APIs when operator authentication is available
```

Do not expose the validator as the public product endpoint. It is a stateless
validation service, not the application backend.

## Current Route Contract

- TALOS canonical route: `/`
- Compatibility redirects: `/chat` -> `/`, `/dashboard` -> `/`
- Laravel liveness route: `/up`
- TALOS readiness route: `/readyz`
- Validator health route: `/health`
- Validator validation route: `/validate`

## TALOS Development Deployment

Use this when editing Laravel, Vue, the PHP core, the validator, or browser
automation. From the repository root in Git Bash:

```bash
./talos dev
```

No manual runtime or package-manager setup is required on Windows. The command:

1. reads the pinned manifest at `scripts/toolchain/manifest.json`;
2. downloads PHP, Composer, Node, and the CA bundle from fixed HTTPS origins;
3. verifies every artifact against its tracked SHA-256 digest before extraction;
4. generates relocatable wrappers and `php.ini` under the ignored `.tools/`;
5. runs locked Composer/npm installs only when their lockfile changed;
6. installs the pinned Playwright Chromium runtime and verifies its executable
   independently from npm dependency markers;
7. creates `control-plane/.env` and SQLite when absent;
8. runs migrations and starts validator, Laravel, queue, Vite, and browser worker.

The command stays attached to the terminal. Stop the complete stack with
`Ctrl+C`. A second `talos dev` or repair process fails closed while the first is
running, preventing concurrent `npm ci` or migration operations.

Open:

```text
http://127.0.0.1:8000/
```

Do not open the Vite port as the product URL. Vite only serves development
assets.

On Windows/Git Bash the `dev` script intentionally does not run Laravel Pail,
because Pail requires the `pcntl` extension and Windows PHP does not provide it.
Use `storage/logs/laravel.log` for local log inspection.

### First-run authentication

If the `users` table is empty, TALOS redirects to `/setup` and creates the
initial admin from the UI.

If these variables are set before first boot, the first admin is created from
environment instead:

```env
TALOS_ADMIN_NAME=TALOS Admin
TALOS_ADMIN_EMAIL=admin@example.test
TALOS_ADMIN_PASSWORD=change-this-before-use
```

After users exist, guests are redirected to `/login`.

### Development verification

Run these before claiming a TALOS development deploy works:

```bash
cd control-plane
../.tools/bin/php.cmd artisan test
../.tools/bin/npm.cmd run build

cd ../validator
../.tools/bin/npm.cmd test
../.tools/bin/npm.cmd run build

cd ../browser-worker
../.tools/bin/npm.cmd test
../.tools/bin/npm.cmd run build
```

For UI changes, add Playwright route checks:

```bash
cd control-plane
../.tools/bin/npm.cmd run test:e2e -- --project=chromium
```

### Native Doctor and repair

```bash
./talos doctor
./talos doctor --repair
```

Doctor reports Docker and native profiles independently. It treats a missing
Chromium executable as a failed native profile even when `node_modules` is
present. `--repair` may rebuild only ignored local runtime/dependency state; it
never modifies system PHP, Node, Composer, Docker, or user files outside the
checkout, and it exits immediately if any repair step fails.

If PHP reports missing `curl`, `openssl`, `pdo_sqlite`, or other extensions
after a checkout was copied or renamed, do not edit `php.ini` and do not disable
Composer TLS. Stop the active dev stack and run:

```bash
./talos doctor --repair
bash scripts/bootstrap-tools.sh --verify-only
```

The repair regenerates relative PHP configuration and wrappers for the current
checkout. A checksum mismatch, truncated download, unexpected archive layout,
or untrusted download host fails closed before any downloaded executable runs.

## KADMOS Development Deployment

KADMOS is not a web server. In development it runs from `core/` as a local
operator CLI.

### Setup

```bash
./talos doctor --repair
cd core
../.tools/bin/php.cmd kadmos doctor --json
```

Set URLs explicitly so the CLI follows the current TALOS and validator ports:

```bash
export KADMOS_CONTROL_PLANE_URL=http://127.0.0.1:8000
export KADMOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:3000/health
export KADMOS_VALIDATOR_URL=http://127.0.0.1:3000/validate
```

Optional provider configuration for live LLM commands:

```bash
export KADMOS_API_KEY=sk-...
export KADMOS_MODEL=deepseek-chat
export KADMOS_BASE_URL=https://api.deepseek.com/v1
```

### Beginner flow

```bash
../.tools/bin/php.cmd kadmos
```

This launches the boot animation and guided shell.

Useful guided commands:

```bash
../.tools/bin/php.cmd kadmos --tutorial
../.tools/bin/php.cmd kadmos expert
../.tools/bin/php.cmd kadmos doctor
../.tools/bin/php.cmd kadmos commands
```

### Operator flow

Local-only or self-contained commands:

```bash
../.tools/bin/php.cmd kadmos doctor --json
../.tools/bin/php.cmd kadmos validate path/to/mutations.json --mock
../.tools/bin/php.cmd kadmos benchmark mock --runs=1
../.tools/bin/php.cmd kadmos compare --scenario=tests/benchmarks/scenarios/01_simple_http.json --json
../.tools/bin/php.cmd kadmos trace replay path/to/trace.json --json
../.tools/bin/php.cmd kadmos files ingest path/to/file.txt --dry-run --json
```

Live validator commands:

```bash
../.tools/bin/php.cmd kadmos validate path/to/mutations.json
../.tools/bin/php.cmd kadmos start 5
```

Control-plane commands:

```bash
../.tools/bin/php.cmd kadmos trace replay <run-id> --json
../.tools/bin/php.cmd kadmos recover <run-id> --node=<node-id> --action=retry_node --json
../.tools/bin/php.cmd kadmos export benchmark <benchmark-group-id> --json
```

Current limitation: TALOS APIs are session-gated by the Laravel web guard. The
CLI has fail-closed behavior for unavailable or invalid control-plane responses,
but a production-grade remote operator flow requires an explicit API-token or
operator-auth bridge before write/recovery commands are considered production
ready.

### KADMOS development verification

```bash
cd core
../.tools/bin/php.cmd kadmos doctor --json
../.tools/bin/php.cmd kadmos test
```

## TALOS Production Deployment

Production should be Docker-first. The operator experience is:

```bash
git clone https://github.com/Ninozzz95/agent-virtual-machine.git
cd agent-virtual-machine
./talos up
```

On Windows Command Prompt use `talos.cmd up`. No PHP, Composer, Node, npm, or
pre-existing `.tools` directory is required for this Docker path. The launcher
creates `.env`, generates the internal browser-worker credential and a valid
32-byte Laravel `APP_KEY`, builds all images, and returns nonzero with bounded
service logs when `/readyz` fails. On Unix the generated `.env` is restricted to
mode `0600`; Compose injects it with `env_file` rather than mounting it into the
application filesystem.

Then open:

```text
http://localhost:8088/
```

The first interactive `talos` command shows a short TALOS bootstrap sequence
before running the requested operation. The marker is stored in
`.talos/state.json`, which is local runtime state and must not be committed.

For CI, scripted provisioning, or plain log output, disable presentation output:

```bash
TALOS_NO_BOOT=1 ./talos up
./talos up --no-boot
./talos up --plain
```

### Required production services

The production compose stack contains:

- `talos`: Laravel app with built assets.
- `talos-queue`: Laravel queue worker using the same image and `.env`.
- `validator`: Node/Fastify validator on an internal network URL.
- `browser-worker`: Playwright/Chromium worker on an internal, token-protected
  URL.

The TALOS web image runs nginx plus PHP-FPM. It does not use Laravel's
development server. The container monitors both processes and exits when either
one terminates, allowing the restart policy to recover the complete web tier.

`/readyz` is stricter than process liveness: it verifies Laravel, database,
migrations, storage, queue configuration, validator health, and the authenticated
browser-worker `/ready` endpoint. That endpoint launches Chromium and reports
failure when the browser runtime is missing or cannot start.

Optional later services:

- `postgres`: production database.
- `redis`: queue/cache backend.
- `caddy` or external reverse proxy: HTTPS termination.

### Production environment contract

Root `.env.example` exposes deployment-level knobs:

```env
APP_NAME=TALOS
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=http://localhost:8088
APP_BIND=127.0.0.1
APP_PORT=8088

DB_CONNECTION=sqlite
DB_DATABASE=/app/control-plane/storage/app/talos/database.sqlite
QUEUE_CONNECTION=database

AVM_VALIDATOR_URL=http://validator:3000
TALOS_VALIDATOR_HEALTH_URL=http://validator:3000/health
TALOS_BROWSER_WORKER_URL=http://browser-worker:3100
TALOS_BROWSER_WORKER_TOKEN=

TALOS_ADMIN_NAME=TALOS Admin
TALOS_ADMIN_EMAIL=
TALOS_ADMIN_PASSWORD=

SESSION_DRIVER=database
SECURE_COOKIES=false
ALLOWED_ORIGINS=http://localhost:8088,http://127.0.0.1:8088

TALOS_REGISTRY_WRITE_TOKEN=
TALOS_MODEL_PROVIDER_ALLOWED_HOSTS=api.openai.com,api.deepseek.com,api.anthropic.com,generativelanguage.googleapis.com,openrouter.ai
```

Provider profiles, theme settings, Context Vault, tool registry, benchmarks,
memory, skills, and workflow settings belong in TALOS Settings or persisted
control-plane tables, not as scattered deployment variables.

### Production security rules

- Keep auth enabled.
- Keep `APP_BIND=127.0.0.1` unless intentionally exposing to a private LAN or
  reverse proxy.
- Set `SECURE_COOKIES=true` behind HTTPS.
- Keep validator private/internal.
- Keep provider keys server-side in TALOS model profiles.
- Never expose raw model, database, validator, queue, or storage ports publicly.
- Keep root `.env` readable only by the deployment account. TALOS never mounts
  this file into the PHP-FPM application path.
- Do not commit `.env`, databases, uploads, logs, backups, generated artifacts,
  or provider credentials.

### Native production fallback

Use this only when Docker is unavailable. It is suitable for a private host
behind a real reverse proxy, not for direct public internet exposure by itself.

```bash
cd /srv/avm/control-plane
composer install --no-dev --optimize-autoloader
npm ci --ignore-scripts
npm run build

cp .env.example .env
php artisan key:generate --force
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Run the queue worker as a managed process:

```bash
php artisan queue:work --tries=3 --timeout=90
```

Serve Laravel through PHP-FPM plus Caddy, nginx, or another trusted reverse
proxy. Do not use `php artisan serve` as the production web server.

Run the validator as a managed private service:

```bash
cd /srv/avm/validator
npm ci
npm run build
HOST=127.0.0.1 PORT=3000 npm run start
```

Configure TALOS:

```env
AVM_VALIDATOR_URL=http://127.0.0.1:3000
TALOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:3000/health
APP_ENV=production
APP_DEBUG=false
SECURE_COOKIES=true
```

## KADMOS Production Operator Plan

KADMOS should be deployed as an operator tool, not as a public daemon.

Recommended placement:

- same host as TALOS for local maintenance; or
- a trusted admin workstation connected to the private TALOS URL.

### Installation

```bash
cd /opt/avm/core
composer install --no-dev --optimize-autoloader
```

Configure operator environment:

```bash
export KADMOS_CONTROL_PLANE_URL=https://talos.example.internal
export KADMOS_VALIDATOR_HEALTH_URL=https://talos.example.internal/internal/validator/health
export KADMOS_VALIDATOR_URL=https://talos.example.internal/internal/validator/validate
```

For local private deployments where validator is not proxied:

```bash
export KADMOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:3000/health
export KADMOS_VALIDATOR_URL=http://127.0.0.1:3000/validate
```

### Production-safe KADMOS usage

Safe diagnostics:

```bash
php kadmos doctor --json
php kadmos commands
php kadmos trace replay local-trace.json --json
php kadmos files ingest evidence.txt --dry-run --json
```

Evidence and benchmark operations:

```bash
php kadmos compare --scenario=tests/benchmarks/scenarios/01_simple_http.json --runs=3 --json
php kadmos export benchmark <benchmark-group-id> --json
```

Recovery operations must remain human-in-the-loop:

```bash
php kadmos recover <run-id> --node=<node-id> --action=retry_node --json
```

Production requirement: remote recovery, file ingestion, trace replay by run id,
and benchmark export should use an explicit operator API token or equivalent
control-plane auth bridge. Do not bypass Laravel session/auth middleware to make
CLI operations easier.

## Root Commands

The repository ships these root commands:

```bash
./talos up
./talos dev
./talos down
./talos logs
./talos doctor
./talos doctor --repair
./talos open
./talos fresh
```

Windows wrappers should mirror them:

```bat
talos.cmd up
talos.cmd doctor
```

Command responsibilities:

- `up`: create `.env` if missing, generate the browser-worker credential and
  Laravel app key without host PHP, build images, run migrations, start the
  complete stack, then require validator and launchable-browser `/readyz` checks
  to pass.
- `dev`: provision the pinned native toolchain and locked dependencies, then
  start Laravel, queue, Vite, validator, and browser worker in one terminal.
- `doctor`: inspect Docker and native profiles independently.
- `doctor --repair`: repair only ignored native tool/dependency/application
  state; system runtimes are never changed.
- `open`: open the canonical TALOS URL.
- `fresh`: development-only database reset with an explicit warning.

Interactive boot behavior:

- the first interactive command in a workspace shows `TALOS bootstrap`;
- `help` stays plain;
- non-TTY output, `CI=true`, `TALOS_NO_BOOT=1`, `--no-boot`, and `--plain`
  suppress the bootstrap;
- state lives in `.talos/state.json` and is intentionally gitignored.

## Deployment Checklist

Development:

- [ ] Validator starts on `127.0.0.1:3000`.
- [ ] Browser worker starts on `127.0.0.1:3100`.
- [ ] TALOS starts on `127.0.0.1:8000`.
- [ ] `/` redirects guests to `/setup` or `/login`.
- [ ] `/chat` and `/dashboard` redirect to `/`.
- [ ] `php artisan test` passes.
- [ ] `npm run build` passes in `control-plane/`.
- [ ] `npm test` and `npm run build` pass in `validator/`.
- [ ] `npm test`, `npm run build`, and `npm run doctor:runtime` pass in
      `browser-worker/`.
- [ ] `kadmos doctor --json` returns controlled JSON.

Production target:

- [ ] Root `.env.example` exists and contains only deployment-level settings.
- [ ] `docker-compose.yml` starts TALOS, queue, validator, and browser worker.
- [ ] Validator and browser worker are internal-only.
- [ ] SQLite persistence does not mount over tracked migration files.
- [ ] The TALOS image contains the PHP core and runs nginx plus PHP-FPM.
- [ ] TALOS is the only public web entrypoint.
- [ ] First admin can be created from UI or pre-seeded env.
- [ ] Queue worker is supervised.
- [ ] `/up` and `/readyz` are used for liveness/readiness checks.
- [ ] The Docker integration job builds every image, verifies `/readyz`, and
      proves storage survives a Compose restart.
- [ ] Provider keys are stored server-side, never in browser storage.
- [ ] KADMOS remote operator commands use explicit auth before write/recovery
      actions are considered production ready.
