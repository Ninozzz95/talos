# TALOS and KADMOS Deployment Plans

This document defines the official development and production deployment plans
for the AVM workspace. It is intentionally split by product surface:

- TALOS is the authenticated web control plane and UI.
- KADMOS is the operator CLI for diagnostics, validation, evidence, benchmark,
  trace, and recovery workflows.

The current repository is native-development ready. The production target is a
Docker-first packaging layer that starts TALOS, the queue worker, and the
validator with one command. Until that packaging layer exists, production notes
below are the required implementation target and the safe native fallback.

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
- Validator health route: `/health`
- Validator validation route: `/validate`

## TALOS Development Deployment

Use this when actively developing the Laravel/Vue UI, APIs, tests, and local
product behavior.

### Requirements

- Repo-local tools in `.tools/`.
- Composer dependencies installed in `control-plane/` and `core/`.
- Node dependencies installed in `control-plane/` and `validator/`.
- SQLite database at `control-plane/database/database.sqlite`.

### Terminal A: validator

From Git Bash:

```bash
cd /c/Users/ninox/Desktop/AVM/validator
export PATH="$PWD/../.tools/node:$PWD/../.tools/bin:$PATH"

../.tools/bin/npm.cmd install
../.tools/bin/npm.cmd run build

export HOST=127.0.0.1
export PORT=3000
../.tools/bin/npm.cmd run start
```

Expected health URL:

```text
http://127.0.0.1:3000/health
```

### Terminal B: TALOS control-plane and Vite

From Git Bash:

```bash
cd /c/Users/ninox/Desktop/AVM/control-plane
export PATH="$PWD/../.tools/php:$PWD/../.tools/node:$PWD/../.tools/bin:$PATH"

../.tools/bin/composer.cmd install
../.tools/bin/npm.cmd install --ignore-scripts

test -f .env || cp .env.example .env
grep -q '^AVM_VALIDATOR_URL=' .env || echo 'AVM_VALIDATOR_URL=http://127.0.0.1:3000' >> .env
grep -q '^TALOS_VALIDATOR_HEALTH_URL=' .env || echo 'TALOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:3000/health' >> .env

../.tools/bin/php.cmd artisan key:generate --force
../.tools/bin/php.cmd artisan migrate
../.tools/bin/php.cmd artisan config:clear

../.tools/bin/composer.cmd run dev
```

Open:

```text
http://127.0.0.1:8000/
```

Do not open the Vite port as the product URL. Vite only serves development
assets.

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
cd /c/Users/ninox/Desktop/AVM/control-plane
../.tools/bin/php.cmd artisan test
../.tools/bin/npm.cmd run build

cd /c/Users/ninox/Desktop/AVM/validator
../.tools/bin/npm.cmd test
../.tools/bin/npm.cmd run build
```

For UI changes, add Playwright route checks:

```bash
cd /c/Users/ninox/Desktop/AVM/control-plane
../.tools/bin/npm.cmd run test:e2e -- --project=chromium
```

## KADMOS Development Deployment

KADMOS is not a web server. In development it runs from `core/` as a local
operator CLI.

### Setup

```bash
cd /c/Users/ninox/Desktop/AVM/core
export PATH="$PWD/../.tools/php:$PWD/../.tools/node:$PWD/../.tools/bin:$PATH"

../.tools/bin/composer.cmd install
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
cd /c/Users/ninox/Desktop/AVM/core
../.tools/bin/php.cmd kadmos doctor --json
../.tools/bin/php.cmd kadmos test
```

## TALOS Production Deployment Plan

Production should be Docker-first. The intended operator experience is:

```bash
git clone <repo-url> AVM
cd AVM
cp .env.example .env
docker compose up -d --build
```

Then open:

```text
http://localhost:8088/
```

### Required production services

The production compose stack must contain:

- `talos`: Laravel app with built assets.
- `talos-queue`: Laravel queue worker using the same image and `.env`.
- `validator`: Node/Fastify validator on an internal network URL.

Optional later services:

- `postgres`: production database.
- `redis`: queue/cache backend.
- `caddy` or external reverse proxy: HTTPS termination.

### Production environment contract

Root `.env.example` should expose only deployment-level knobs:

```env
APP_NAME=TALOS
APP_ENV=production
APP_DEBUG=false
APP_URL=http://localhost:8088
APP_BIND=127.0.0.1
APP_PORT=8088

DB_CONNECTION=sqlite
QUEUE_CONNECTION=database

AVM_VALIDATOR_URL=http://validator:3000
TALOS_VALIDATOR_HEALTH_URL=http://validator:3000/health

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
- Do not commit `.env`, databases, uploads, logs, backups, generated artifacts,
  or provider credentials.

### Native production fallback

Use this only until Docker packaging exists. It is suitable for a private host
behind a real reverse proxy, not for public internet exposure by itself.

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

## Target Root Commands

The production packaging layer should add these root commands:

```bash
./talos up
./talos down
./talos logs
./talos doctor
./talos open
./talos fresh
```

Windows wrappers should mirror them:

```bat
talos.cmd up
talos.cmd doctor
```

Command responsibilities:

- `up`: create `.env` if missing, generate app key if needed, build images,
  run migrations, start TALOS, queue, and validator.
- `doctor`: check Docker/native tools, database, storage, queue, validator,
  auth bootstrap, and public URL.
- `open`: open the canonical TALOS URL.
- `fresh`: development-only database reset with an explicit warning.

## Deployment Checklist

Development:

- [ ] Validator starts on `127.0.0.1:3000`.
- [ ] TALOS starts on `127.0.0.1:8000`.
- [ ] `/` redirects guests to `/setup` or `/login`.
- [ ] `/chat` and `/dashboard` redirect to `/`.
- [ ] `php artisan test` passes.
- [ ] `npm run build` passes in `control-plane/`.
- [ ] `npm test` and `npm run build` pass in `validator/`.
- [ ] `kadmos doctor --json` returns controlled JSON.

Production target:

- [ ] Root `.env.example` exists and contains only deployment-level settings.
- [ ] `docker-compose.yml` starts TALOS, queue, and validator.
- [ ] Validator is internal-only.
- [ ] TALOS is the only public web entrypoint.
- [ ] First admin can be created from UI or pre-seeded env.
- [ ] Queue worker is supervised.
- [ ] `/up` or future `/readyz` is used for health checks.
- [ ] Provider keys are stored server-side, never in browser storage.
- [ ] KADMOS remote operator commands use explicit auth before write/recovery
      actions are considered production ready.

