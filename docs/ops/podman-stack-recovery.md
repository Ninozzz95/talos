# Runbook — TALOS local stack (:8088) won't start / Podman machine recovery

**Applies when:** `./talos up` fails, or `http://localhost:8088` doesn't respond, with a Podman machine error such as:

```
Starting Podman Machine 'talos-machine'...
Podman Machine start failed: Starting machine "talos-machine"
Error: Job failed with error code: 32773. Description: Failed to set value of the
'ignition.config.0' Data Exchange integration service item for virtual machine
'talos-machine': One or more arguments are invalid (0x80070057)
Selected runtime: podman (failed)
```

## TL;DR fix — **no Windows reboot needed**
Stop, then start, the pinned Podman machine, then bring the stack up:

```bash
.tools/container-runtime/podman/usr/bin/podman.exe machine stop  talos-machine
.tools/container-runtime/podman/usr/bin/podman.exe machine start talos-machine
./talos up
```

From the interactive prompt you can run the first two directly with the `! ` prefix.

## Context you need
- The :8088 stack runs on **Podman**, a **pinned/vendored** binary — *not* a system install:
  - Path: `.tools/container-runtime/podman/usr/bin/podman.exe` (v6.0.1, pinned in `scripts/container-runtime/manifest.json`).
  - `podman` is **not on the interactive PATH** (neither PowerShell nor git-bash) — always call the pinned path. `./talos` resolves it internally via `scripts/container-runtime/runtime.sh` and `Talos.ContainerRuntime.psm1`.
- The runtime is a **Hyper-V VM** named `talos-machine`, **rootless**.

## Diagnose
```bash
.tools/container-runtime/podman/usr/bin/podman.exe machine list
```
Example seen on 2026-07-21:
```
NAME            VM TYPE   CREATED     LAST UP   CPUS   MEMORY   DISK SIZE
talos-machine*  hyperv    3 days ago  Never     8      8GiB     100GiB
```
`LAST UP: Never` = the VM was created but had **never booted** — the cold `start` inside `./talos up` hit the ignition error; an explicit `stop`→`start` booted it.

## Fix ladder (least → most disruptive)
1. **Stop + start the machine** — *this fixed it on 2026-07-21.*
   ```bash
   .tools/container-runtime/podman/usr/bin/podman.exe machine stop  talos-machine
   .tools/container-runtime/podman/usr/bin/podman.exe machine start talos-machine
   ```
   A good start prints `Machine "talos-machine" started successfully` and `API forwarding listening on: npipe:////./pipe/docker_engine`.
2. **Restart the Hyper-V management service** (elevated PowerShell), if `start` still errors, then retry step 1:
   ```powershell
   Restart-Service vmms
   ```
   *(General remediation for Hyper-V Data-Exchange/ignition failures — not exercised in our run.)*
3. **Recreate the machine — LAST RESORT, DESTRUCTIVE:**
   ```bash
   .tools/container-runtime/podman/usr/bin/podman.exe machine rm    talos-machine
   # re-provision via ./talos's own bootstrap (preferred) or `podman machine init`
   .tools/container-runtime/podman/usr/bin/podman.exe machine start talos-machine
   ```
   ⚠️ Destroys the VM and any volumes inside it. The app re-runs `php artisan migrate --force` on boot so the schema is rebuilt, but in-VM data is lost. Prefer letting `./talos` re-provision.
4. **Reboot Windows** — only if everything above fails.

## Bring it back + verify
```bash
./talos up
curl http://localhost:8088/readyz     # or open http://localhost:8088
```
The queue container should show *Started* and readiness OK.

## Observations (2026-07-21)
- The failure was **host/VM-level, not app code** — `./talos up` printed the ignition `0x80070057` error and `Selected runtime: podman (failed)` before touching the application.
- `machine stop` reported *"stopped successfully"* even though the machine had never been up — harmless; run it before `start` to normalise state.
- The machine is **rootless**; :8088 is a high port, so rootless is fine. Only switch `--rootful` if you need ports < 1024.
- **No Windows reboot was required** — the whole outage was a stuck Podman VM.
