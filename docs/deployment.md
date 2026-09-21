# TALOS and KADMOS Deployment Plans

This document defines the official development and production deployment plans
for the AVM workspace. It is intentionally split by product surface:

- TALOS is the authenticated web control plane and UI.
- KADMOS is the operator CLI for diagnostics, validation, evidence, benchmark,
  trace, and recovery workflows.

The repository supports two deployment paths:

- native development, useful while editing Laravel, Vue, the validator, and the
  PHP core;
- adaptive container deployment, useful for local demos and private
  production-like installs.

## Canonical Topology

```text
Browser
  -> TALOS Laravel control-plane
       -> SQLite/PostgreSQL database
       -> Laravel queue worker
       -> Node validator on private/internal URL
       -> ClamAV malware scanner on private/internal URL
       -> Apache Tika extractor on private/internal URL
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
8. generates one ephemeral P-256 browser-action keypair for the current stack,
   giving only the private half to Laravel/queue and only the public half to the
   Browser Worker;
9. runs migrations and starts validator, Laravel, queue, Vite, and browser worker.

Native development keeps the web stack usable when Docker is absent, but real
PDF/Office ingestion is fail-closed until the file sidecars are available. To
exercise the production-equivalent ingestion path while running TALOS natively:

```bash
docker compose up -d clamav tika
```

The sidecars bind only to `127.0.0.1` on host ports `13310` and `19998` by
default. `control-plane/.env` must use those local endpoints. Text, PDF and
Office uploads never receive an implicit development scanner bypass.

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

Doctor reports the selected container runtime and native profiles independently. It treats a missing
Chromium executable as a failed native profile even when `node_modules` is
present. `--repair` may rebuild only ignored local runtime/dependency state; it
never modifies system PHP, Node, Composer, container runtimes, or user files outside the
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

Production-like startup is container-first. The operator experience is:

```bash
git clone https://github.com/Ninozzz95/agent-virtual-machine.git
cd agent-virtual-machine
./talos up
```

On Windows Command Prompt use `talos.cmd up`. No PHP, Composer, Node, npm, or
pre-existing `.tools` directory is required for this path. The launcher
creates `.env`, generates the internal browser-worker credential and a valid
32-byte Laravel `APP_KEY`, builds all images, and returns nonzero with bounded
service logs when `/readyz` fails. On Unix the generated `.env` is restricted to
mode `0600`; Compose injects it with `env_file` rather than mounting it into the
application filesystem.

`APP_URL` is the canonical browser origin for every generated redirect, asset,
OAuth callback and absolute application URL. It must include the externally
reachable scheme, host and non-default port, for example
`http://localhost:8088` for the default loopback deployment or
`https://talos.example.internal` behind a trusted HTTPS proxy. TALOS does not
derive this authority from an untrusted or port-stripped `Host` header. When
`APP_BIND` or `APP_PORT` changes, update `APP_URL` to the matching public origin
before startup.

### Adaptive container runtime bootstrap

`./talos up` uses one provider-neutral command surface. With
`TALOS_CONTAINER_RUNTIME=auto`, TALOS first reuses a healthy Docker runtime,
then a healthy Podman runtime. If neither is healthy, automatic installation is
available on supported x64 Windows hosts:

- Windows 10/11 workstations install Docker Desktop `4.82.0` (build `233772`)
  in per-user WSL 2 mode.
- Windows Server uses Podman `6.0.1` with Podman Machine on Hyper-V and the
  Docker Compose `5.1.4` provider. Docker Desktop is never installed on Windows
  Server because that platform is not supported upstream.

The bootstrap reads `scripts/container-runtime/manifest.json`, accepts only the
tracked HTTPS origins and redirects, checks the exact byte count and SHA-256,
validates archive paths, and stages replacements atomically. The extracted
Podman executable has its own byte-count and SHA-256 pin; a changed copy is
restored from the verified archive before it can execute. Docker Desktop is
also required to have a valid `Docker Inc` Authenticode signature. Downloads,
binaries, the Podman machine adapter and lifecycle state live under the ignored
`.tools/container-runtime` directory. Runtime state is evidence for Doctor, not
authority: every command probes the real engine and Compose provider again.

Docker Desktop installation is performed only after the operator reviews and
accepts the Docker Subscription Service Agreement. Interactive startup asks the
operator to type `ACCEPT`. Unattended provisioning must make that decision
explicitly:

```bash
TALOS_DOCKER_DESKTOP_LICENSE_ACCEPTED=1 ./talos up
```

Machine-wide WSL 2 or Hyper-V preparation uses a visible UAC boundary. Run this
operation only from a trusted checkout. The bootstrap resolves PowerShell, WSL,
and system tools from the protected Windows system directory, and the approved
bootstrap, module, manifest, and Podman executable remain read-fenced and
SHA-256 checked while the elevated process runs. When a standard user supplies
separate administrator credentials at UAC, TALOS preserves the original
requesting user SID and grants that account only membership in Hyper-V Administrators;
it does not add the account to Administrators. If
Windows reports a restart required, the launcher exits without claiming
readiness or starting the stack. Restart Windows once, return to the checkout,
and rerun the same `./talos up` command. UAC cancellation, download failure,
checksum mismatch, machine startup timeout, or Compose failure remains a
controlled nonzero result.

Before initializing a Hyper-V Podman Machine, TALOS validates the host's
configured default virtual-machine and virtual-disk directories. Missing
directories are created through the same UAC boundary only when both settings
are absolute paths on existing local drives. TALOS does not rewrite the
Hyper-V defaults. UNC paths, relative paths, unavailable drives, or a file
where a directory is required fail closed; `./talos doctor` reports
`hyper-v storage WARN preparation_required` until the condition is resolved.

Provider selection can be pinned without changing the public commands:

```env
TALOS_CONTAINER_RUNTIME=auto
# TALOS_CONTAINER_RUNTIME=docker
# TALOS_CONTAINER_RUNTIME=podman
TALOS_PODMAN_MACHINE=talos-machine
```

`TALOS_PODMAN_MACHINE` is both the Podman Machine name and the explicit Podman
connection used by every TALOS engine, health, and Compose command. Changing it
selects a separate operator-managed machine; TALOS never falls back to Podman's
unrelated global default connection.

On a healthy Podman installation, `./talos doctor` also inspects that exact
named machine through Podman's documented formatted fields. It reports the VM
provider (for example `hyperv`), machine name and state, container-engine
health, Podman version, and Compose version. These checks are read-only and do
not change Podman's default connection, start another machine, request UAC, or
repair the host. A missing, mismatched, or stopped configured machine keeps
the container-runtime section non-ready and points the operator back to
`./talos up`. The overall Doctor command may still succeed when the independent
native-development profile is healthy; it never promotes the failed container
profile or validates its Compose configuration.

An explicit provider never falls back to the other provider. `./talos down` and
`./talos logs` require an already healthy runtime and never trigger installation.
Use `./talos doctor` to inspect the selected provider, engine or machine health,
Compose health, restart state, and native development profile.

TALOS does not uninstall a host runtime or delete user data during rollback.
Stop the stack with `./talos down`, change `TALOS_CONTAINER_RUNTIME`, and rerun
`./talos up`. Podman binaries and bootstrap cache can be removed by deleting
only `.tools/container-runtime` after the stack is stopped; Compose volumes are
retained unless the operator explicitly runs the development-only `talos fresh`
flow. Automatic runtime installation is currently Windows-only; macOS and Linux
must provide a healthy compatible Docker or Podman runtime.

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
- `clamav`: digest-pinned ClamAV 1.5.3 daemon; Laravel sends bytes through
  `INSTREAM`, never a host path.
- `tika`: digest-pinned Apache Tika 3.3.1 minimal server for bounded PDF/OOXML
  extraction. It is not treated as a security boundary.
- `searxng`: optional internal metasearch service, enabled only through the
  Compose `search` profile. Its API is not published on a host port.

The TALOS web image runs nginx plus PHP-FPM. It does not use Laravel's
development server. The container monitors both processes and exits when either
one terminates, allowing the restart policy to recover the complete web tier.

`/readyz` is stricter than process liveness: it verifies Laravel, database,
migrations, storage, queue configuration, validator health, the pinned ClamAV
and Tika protocols, and the authenticated browser-worker `/ready` endpoint.
The migration check compares every tracked migration file with Laravel's
migration repository; any pending file returns HTTP 503 with the remedy
`php artisan migrate --force` instead of allowing missing-column failures to
surface later in user requests.
That endpoint launches Chromium and reports
failure when the browser runtime is missing or cannot start. TALOS requires both
`talos.browser.worker.v2` and the exact
`talos_browser_hmi_runtime_v2.1.0` compatibility identifier, plus the ES256
action-capability descriptor advertised by the authenticated handshake. A
worker from an older checkout may still answer HTTP health checks, but
`/readyz` rejects it before a browser session can start.

### Browser deployment gates

CI keeps the Chromium and production-stack checks separate so neither can be
silently skipped by a failure in an unrelated test job:

- `browser-worker-live` installs the locked browser-worker and control-plane
  dependencies, installs the pinned Playwright Chromium runtime, generates a
  random 256-bit worker token, starts the worker with `NODE_ENV=production`,
  waits for authenticated `/ready`, runs the official MCP Streamable HTTP
  client round trip against that live worker, and runs real Laravel/HMI and UI
  gates. It also commits one authorized action, restarts the worker process,
  and proves that the new worker instance rejects the old session before any
  action can be redispatched.
- `docker-integration` builds the production Compose stack under a unique
  project name. It authenticates through the real TALOS login and CSRF flow,
  creates a durable chat and browser session, navigates only to
  `https://example.com/`, verifies a hash-bound PNG preview, completes the HMI
  preflight and confirmation path, and checks persisted screenshot, snapshot,
  and event evidence.
- The Docker gate recreates the stack without deleting the test volume, signs
  in again, and verifies that the same session, evidence pointers, PNG bytes,
  SHA-256 digest, snapshot policy, and event stream remain available. Final
  teardown removes all profile containers and volumes and restores any root
  `.env` that existed before the gate.

Run the focused contracts locally from the repository root:

```bash
bash scripts/tests/talos-browser-gates-contract.sh
bash scripts/tests/talos-live-browser-worker-ci.sh
bash scripts/tests/talos-docker-integration.sh
```

The live worker command requires installed `browser-worker` npm dependencies,
the pinned Chromium runtime, control-plane Composer dependencies, and PHP 8.5.
The Docker command requires Docker Compose and is destructive only to its
ephemeral `talos-integration-<pid>` Compose project. A failure prints service
status and bounded logs before teardown; credentials and worker tokens are not
printed.

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
TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=false

TALOS_WEB_SEARCH_PROVIDER=unavailable
TALOS_SEARXNG_URL=http://searxng:8080
TALOS_SEARXNG_SECRET=
TALOS_BROWSER_SEARCH_ENABLED=false
TALOS_BROWSER_SEARCH_ORIGIN=

TALOS_FILE_SIDECAR_BIND=127.0.0.1
TALOS_CLAMAV_HOST_PORT=13310
TALOS_TIKA_HOST_PORT=19998
TALOS_CLAMAV_EXPECTED_VERSION=1.5.3
TALOS_TIKA_EXPECTED_VERSION=3.3.1
TALOS_TIKA_MAX_RESPONSE_BYTES=10485760
TALOS_TIKA_MAX_EXTRACTED_BYTES=5242880

# Optional GPU OCR profile. Disabled in the default stack.
TALOS_OCR_ENABLED=false
TALOS_OCR_WORKER_TOKEN=
TALOS_OCR_VLLM_API_KEY=
TALOS_OCR_LIVE_HOST_PORT=13200
TALOS_OCR_TIMEOUT_SECONDS=180
TALOS_OCR_REQUEST_TIMEOUT_SECONDS=170
TALOS_OCR_STARTUP_TIMEOUT_SECONDS=900
TALOS_OCR_MAX_RESPONSE_BYTES=10485760

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

### Secure file-ingestion sidecars

`./talos up` starts ClamAV and Tika as required services. Their images use both
an immutable tag and registry digest. Compose exposes their optional host gates
only on loopback; TALOS containers use the private service names `clamav` and
`tika`. Do not change `TALOS_FILE_SIDECAR_BIND` to a LAN/public address: neither
clamd TCP nor Tika Server provides the product authentication boundary.

The ClamAV service repeats the official image's `clamdcheck.sh` health probe and
six-minute startup grace explicitly in Compose. This preserves the required
`service_healthy` dependency on OCI engines that do not expose the image's
healthcheck metadata consistently; TALOS never substitutes process-started for
an actual ClamD PING/PONG readiness result.

Run the real integration gate after both health checks pass:

```bash
cd control-plane
TALOS_FILE_SIDECAR_LIVE=1 \
TALOS_CLAMAV_HOST=127.0.0.1 TALOS_CLAMAV_PORT=13310 \
TALOS_TIKA_URL=http://127.0.0.1:19998 \
../.tools/bin/php.cmd artisan test tests/Integration/TalosFileSidecarLiveTest.php
```

The gate scans both clean and EICAR bytes and extracts independent sentinels
from a generated PDF and DOCX. A scanner timeout, version mismatch, malformed
response, extraction failure or changed post-scan checksum leaves the file
unavailable and visible as a controlled lifecycle fault.

### Optional DeepSeek OCR-2 profile

OCR for PNG, JPEG, WebP and image-only PDF input is an optional NVIDIA GPU
profile. The normal TALOS stack remains CPU-only and starts with
`TALOS_OCR_ENABLED=false`. Enabling OCR requires a CUDA-capable NVIDIA GPU,
current host drivers, Docker GPU support through the NVIDIA Container Toolkit,
and enough VRAM for the pinned DeepSeek OCR-2 model. Confirm that Docker can see
the intended GPU before enabling the profile; TALOS deliberately does not fall
back to a provider API or mark an image available when the local runtime is
unhealthy.

Set the following value in the root `.env`, then start TALOS normally:

```env
TALOS_OCR_ENABLED=true
```

```bash
./talos up
```

The launcher enables Compose profile `ocr` and generates independent 64-byte
hex credentials for the OCR worker and vLLM when they are absent. A one-shot model fetcher
downloads the exact DeepSeek OCR-2 revision into the persistent
cache and then exits. Only that fetcher joins `ocr-egress`. The digest-pinned
vLLM 0.25.1 runtime starts after the fetch succeeds with `HF_HUB_OFFLINE=1` and
`TRANSFORMERS_OFFLINE=1`; the request-bearing runtime never retains egress.
The fetcher is the only writer of the persistent Hugging Face cache. vLLM mounts
that read-only model snapshot and writes compilation/cache state only to its
bounded ephemeral `/tmp`, preventing request-time mutation of model artifacts.
The separate non-root TALOS OCR worker has bounded Uvicorn admission, memory,
swap and PID limits. Production publishes no OCR host port: only the Laravel
web/queue tier shares `ocr-app` with the worker, the worker can address vLLM
through the separate internal `ocr-private` network, and Laravel cannot address
vLLM directly. `/readyz` becomes blocking while OCR is enabled and reports
worker, model, runtime and measured renderer drift instead of silently degrading.

The first OCR startup may need to download and load the pinned model before
readiness can pass. `TALOS_OCR_STARTUP_TIMEOUT_SECONDS` controls only the
launcher readiness window while OCR is enabled; it defaults to 900 seconds and
accepts integer values from 60 through 3600. The normal stack keeps its existing
60-second readiness window when OCR is disabled. An expired window fails closed
and prints OCR worker/runtime logs instead of reporting a healthy deployment.
`TALOS_OCR_REQUEST_TIMEOUT_SECONDS` is a separate per-request worker deadline;
it defaults to 170 seconds so the worker returns a canonical retryable timeout
before Laravel's default 180-second OCR transport window expires. Native PDF and
image rendering remains capacity-bound even after a caller timeout, preventing
repeated failed requests from accumulating uncancellable renderer threads. The
Laravel-to-worker transport deliberately ignores inherited HTTP proxy settings
so uploaded bytes cannot leave the configured private sidecar route.

The loopback port exists only in the explicit live-test overlay. After the base
stack is healthy, run this from the repository root:

```bash
docker compose -f docker-compose.yml -f docker/ocr-live.yml --profile ocr up -d
export TALOS_OCR_WORKER_TOKEN="$(grep '^TALOS_OCR_WORKER_TOKEN=' .env | tail -n 1 | cut -d= -f2-)"
export TALOS_OCR_URL=http://127.0.0.1:13200

cd ocr-worker
TALOS_OCR_LIVE=1 uv run pytest -q tests/integration/test_live_deepseek_ocr.py

cd ../control-plane
TALOS_OCR_LIVE=1 ../.tools/bin/php.cmd artisan test tests/Integration/TalosOcrSidecarLiveTest.php
```

Both gates send a generated PNG and an image-only PDF through the real worker
and pinned vLLM runtime. They require sentinel text, exact source/page/text
hashes and exact model/runtime/renderer provenance. Mocks do not replace these
promotion gates. The repository's normal automated suites leave them explicitly
skipped when `TALOS_OCR_LIVE` is absent.

To roll back without deleting user data, set `TALOS_OCR_ENABLED=false` and run
`./talos up` again. The launcher removes stale auto-managed OCR services and
`/readyz` returns the OCR check to non-blocking `disabled`. Existing OCR
provenance remains attached to historical files; regular text/Tika ingestion
continues, while new image-only input fails closed rather than being relabeled
or sent to another model.

### Web search providers

Search is fail-closed by default. With `TALOS_WEB_SEARCH_PROVIDER=unavailable`,
TALOS reports that current web search is unavailable and never substitutes
fixture results or remembered sources.

The recommended private deployment uses the directly integrated official
SearXNG container. In root `.env`, set:

```env
TALOS_WEB_SEARCH_PROVIDER=searxng
TALOS_SEARXNG_URL=http://searxng:8080
```

Then run:

```bash
./talos up
```

When `TALOS_WEB_SEARCH_PROVIDER=searxng`, the Bash launcher automatically
enables the Compose `search` profile for `up` and related Compose commands,
keeps the internal SearXNG `/healthz` liveness check after TALOS `/readyz`, and
then performs a bounded JSON API readiness probe against
`/search?q=talos&format=json`. The probe parses the response and requires an
object whose `results` field is a list; an empty list is valid and does not
claim that external search results are available. Failure prints the last
probe error plus SearXNG status and logs.

An explicit `COMPOSE_PROFILES` list remains unchanged; when it already
contains `search`, the launcher does not add a duplicate `--profile search`
option. When the effective provider is changed away from `searxng`, `talos up`
removes a stale auto-managed SearXNG service with
`docker compose --profile search rm -sf searxng`, unless `search` is explicitly
present in `COMPOSE_PROFILES`. The default `unavailable` provider therefore
does not start or retain an implicitly managed search service, while an
explicit profile selection remains the operator's responsibility.

`talos down` always runs `docker compose --profile "*" down`, and `talos fresh`
uses the same all-profile teardown before removing volumes. This removes a
previously enabled SearXNG service even after the provider is changed back to
`unavailable`.

The launcher generates `TALOS_SEARXNG_SECRET` when absent. The Compose profile
uses a tag-and-digest-pinned official image, mounts the tracked JSON-only API
configuration, and exposes port `8080` only to the internal Compose network.
Search result URLs still pass the public-network policy; configuring a trusted
internal SearXNG endpoint does not allow `web_fetch` to reach loopback, private,
link-local, or cloud metadata addresses. See the upstream
[SearXNG container installation](https://docs.searxng.org/admin/installation-docker.html)
and [Search API](https://docs.searxng.org/dev/search_api.html) documentation.

An external browser-backed fallback is available only through explicit opt-in:

```env
TALOS_WEB_SEARCH_PROVIDER=browser
TALOS_BROWSER_SEARCH_ENABLED=true
TALOS_BROWSER_SEARCH_ORIGIN=https://your-search-origin.example/search
```

This mode opens the configured public origin in an ephemeral, owner-scoped,
read-only Chromium session. The query and result URLs therefore leave the
control plane and are subject to that origin's privacy policy. TALOS rejects
private origins, closes the session after every search, and marks all returned
content as untrusted.

### Production security rules

- Keep auth enabled.
- Keep `APP_BIND=127.0.0.1` unless intentionally exposing to a private LAN or
  reverse proxy.
- Set `SECURE_COOKIES=true` behind HTTPS.
- Keep validator private/internal.
- Keep provider keys server-side in TALOS model profiles.
- Keep SearXNG internal; do not publish its raw API port.
- Keep ClamAV and Tika internal. Their loopback test bindings are not public
  service endpoints and must not be reverse-proxied.
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

### Native browser-worker service

The native fallback must run the pinned Playwright worker as a managed private
service. Provision two independent authentication layers:

1. Generate one strong service token and inject the same value into Laravel and
   the worker.
2. Generate one P-256 action keypair. Laravel receives the private key and key
   ID; the worker receives the public key and the same key ID. Never give the
   private key to the worker or the public key to Laravel/queue.

The tracked generator updates an environment file atomically, applies
owner-only permissions where supported, and never prints key material:

```bash
node control-plane/scripts/browser-action-keypair.mjs \
  --env-file /etc/talos/browser-action-keys.env
```

Move the generated values into the host secret manager or separate
root-readable service environment files, then remove the combined provisioning
file. Do not publish port `3100`.

```bash
cd /srv/avm/browser-worker
npm ci
npm run build
npx playwright install --with-deps chromium

HOST=127.0.0.1 \
PORT=3100 \
NODE_ENV=production \
TALOS_BROWSER_WORKER_TOKEN=<same-strong-secret> \
TALOS_BROWSER_ACTION_PUBLIC_KEY_B64=<public-key-base64> \
TALOS_BROWSER_ACTION_KEY_ID=<same-key-id> \
npm run start
```

Configure the control plane with the matching internal endpoint and secret:

```env
TALOS_BROWSER_WORKER_URL=http://127.0.0.1:3100
TALOS_BROWSER_WORKER_TOKEN=<same-strong-secret>
TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true
TALOS_BROWSER_ACTION_PRIVATE_KEY_B64=<private-key-base64>
TALOS_BROWSER_ACTION_KEY_ID=<same-key-id>
```

Use systemd, Supervisor, or the host's equivalent process manager for the
worker, validator, queue and PHP-FPM. Production boot is fail-closed: Laravel
rejects a missing, malformed or weak browser-worker configuration before it
serves TALOS. The reverse proxy or deployment controller must not expose the
TALOS UI until `/readyz` reports `browser_worker.status=healthy`.

HTTPS worker URLs are accepted by default. A direct production HTTP worker URL
is rejected unless `TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true`
is explicitly set for a private, trusted internal bridge such as the bundled
Compose network or loopback native fallback. This opt-in does not enable public
transport.

The adaptive `./talos up` path performs runtime selection, secret generation, service
wiring, dependency ordering and readiness check automatically and remains the
recommended production installation.

Production image builds exclude generated Laravel PHP manifests from
`control-plane/bootstrap/cache`. At container startup TALOS removes only the
package and service-provider manifests and regenerates them from the production
Composer dependency set before migrations. This prevents a developer machine's
cached dev-only providers from contaminating a production image while preserving
unrelated optimized cache files.

The production build also excludes local storage, test output, test suites,
generated frontend bundles, and repository documentation from OCI build
contexts. Browser and optional OCR workers use their own source directories as
contexts. The web and queue services share `${TALOS_APP_IMAGE:-talos-app:local}`;
only the web service builds it, while the queue reuses that exact local image.
Dependency lockfiles are copied before changing application source so normal
rebuilds retain Composer and npm layers. `./talos up` still evaluates source
changes and never deletes local artifacts to obtain this speedup.

The TALOS frontend stage has a narrower cache boundary than the PHP runtime.
Only package manifests, `.npmrc`, Vite and TypeScript configuration, maintained
package patches, the Vite build driver, `resources/`, and `public/` can
invalidate the frontend bundle. A backend-only change under `app/`, `routes/`,
or `database/` is still copied into the runtime image but reuses both `npm ci`
and `npm run build`. Changes to any declared frontend input rebuild the bundle
normally. The first build initializes this cache; subsequent source reconciles
benefit without disabling source-change detection.

To measure a deployment on the target host, time the first run and one unchanged
second run separately. The second run is the warm-cache gate:

```bash
time ./talos --plain up
time ./talos --plain up
```

Use `./talos doctor` after either run to verify that the selected engine,
Compose provider and application readiness remain healthy; elapsed time alone
is never a readiness signal.

`./talos doctor` returns a non-zero status when browser-worker ownership or the
required HMI protocol is incompatible, even when Docker or the native toolchain
is otherwise available. CI validates the parsed workflow and Compose service
model, requires Docker's canonical `docker compose config --format json`, and
runs an authenticated UI-to-worker artifact gate against real Chromium.

Configure TALOS:

```env
AVM_VALIDATOR_URL=http://127.0.0.1:3000
TALOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:3000/health
TALOS_BROWSER_WORKER_URL=http://127.0.0.1:3100
TALOS_BROWSER_WORKER_TOKEN=<same-strong-secret>
TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true
TALOS_BROWSER_ACTION_PRIVATE_KEY_B64=<private-key-base64>
TALOS_BROWSER_ACTION_KEY_ID=<same-key-id>
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
- `doctor`: inspect the selected container runtime and native profiles independently.
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

### Browser worker protocol boundaries

The browser worker exposes two internal protocol surfaces. Laravel uses the
TALOS REST adapter (`/tools` and `/sessions/{id}/tools/call`) so product state,
policy, evidence, and replay remain control-plane owned. Standards-based
internal clients may use the stateless MCP Streamable HTTP endpoint at
`/sessions/{id}/mcp`, implemented with the pinned official
`@modelcontextprotocol/sdk` package.

Both surfaces require the worker service token and an exact owner reference.
Every consequential action additionally requires a short-lived, one-use ES256
capability signed by Laravel and bound to the owner, worker session, action ID,
operation, state version, exact request and approval. Possessing the service
token alone cannot authorize a click. Compact capabilities and private keys are
never persisted or logged. The MCP endpoint additionally rejects every browser
`Origin` header and validates the HTTP host against
`TALOS_BROWSER_MCP_ALLOWED_HOSTS`. Keep that allowlist limited to the Compose
service name and explicit loopback names. Never publish port `3100`; TALOS
remains the only browser-facing entrypoint.

The REST health and readiness envelopes advertise the pinned worker v2 and HMI
v2.1 compatibility identifiers. The authenticated handshake also advertises
the exact ES256 action-capability profile. Native launchers, Doctor, CI, Docker
health checks, and Laravel `/readyz` require exact matches. After updating
Browser Worker or control-plane code, restart the complete managed stack rather
than leaving a pre-update worker process alive. A protocol mismatch is an
incompatible deployment, not a retryable page interaction.

Worker-local browser contexts and action-result retention are intentionally
ephemeral. After a worker restart, old session IDs fail closed and are never
blindly retried. Laravel owns durable product actions; task-level resume and
checkpoint reconciliation are separate control-plane capabilities.

Browser navigation uses a DNS-pinning egress proxy that rejects private,
loopback, link-local, metadata, reserved, and disallowed resolved addresses.
The Chromium launcher also disables service workers and non-proxied WebRTC UDP
so page code cannot bypass the HTTP(S) proxy through alternate network paths.
Production startup requires a strong browser-worker token; insecure HTTP
transport is available only through an explicit development opt-in.

The authenticated screenshot interaction flow, approval modes, recovery
semantics, and replay guarantees are documented in
[`architecture/talos-interactive-browser-evidence.md`](architecture/talos-interactive-browser-evidence.md).

## Deployment Checklist

Development:

- [ ] Validator starts on `127.0.0.1:3000`.
- [ ] Browser worker starts on `127.0.0.1:3100`.
- [ ] Authenticated worker handshake advertises worker v2, HMI v2.1, and ES256
      action capabilities.
- [ ] Laravel/queue receive only the action private key; the worker receives
      only the public key; validator and Vite receive neither.
- [ ] TALOS starts on `127.0.0.1:8000`.
- [ ] `/` redirects guests to `/setup` or `/login`.
- [ ] `/chat` and `/dashboard` redirect to `/`.
- [ ] `php artisan test` passes.
- [ ] `npm run build` passes in `control-plane/`.
- [ ] `npm test` and `npm run build` pass in `validator/`.
- [ ] `npm test`, `npm run build`, and `npm run doctor:runtime` pass in
      `browser-worker/`.
- [ ] The official MCP SDK client round-trip test passes against the internal
      stateless Streamable HTTP endpoint.
- [ ] `kadmos doctor --json` returns controlled JSON.

Production target:

- [ ] Root `.env.example` exists and contains only deployment-level settings.
- [ ] `docker-compose.yml` starts TALOS, queue, validator, and browser worker.
- [ ] Validator and browser worker are internal-only.
- [ ] `TALOS_BROWSER_MCP_ALLOWED_HOSTS` contains only internal service and
      loopback hostnames; browser `Origin` requests remain denied.
- [ ] Browser egress remains DNS-pinned and Chromium non-proxied WebRTC UDP
      remains disabled.
- [ ] SQLite persistence does not mount over tracked migration files.
- [ ] The TALOS image contains the PHP core and runs nginx plus PHP-FPM.
- [ ] TALOS is the only public web entrypoint.
- [ ] First admin can be created from UI or pre-seeded env.
- [ ] Queue worker is supervised.
- [ ] `/up` and `/readyz` are used for liveness/readiness checks.
- [ ] The Docker integration job enables the pinned `search` profile, verifies
      Compose config, SearXNG `/healthz`, the JSON `results` response shape,
      TALOS `/readyz`, authenticated Browser/HMI evidence and preview reload,
      and all-profile teardown while preserving any existing root `.env`.
- [ ] Provider keys are stored server-side, never in browser storage.
- [ ] KADMOS remote operator commands use explicit auth before write/recovery
      actions are considered production ready.
