# Agent Bus — Implementation LEDGER

Companion to `SPEC.md` (same folder). Ordered, checkable RED/GREEN rows. Sequenced so the bus is
**dogfooded incrementally**: prove Codex⇄Fable end-to-end first, then add Kimi, then GPT5, then the
guardrails, then kill-switch/audit.

**Ground rules for the whole ledger**
- **No commits.** Nothing here is committed by an agent. The user commits `docs/agent-bus/*` and any
  `.gitignore` change if/when they choose. The runtime (`.agent-bus\`) is gitignored (§12 of SPEC)
  and never committed.
- **No `settings.json` edits.** Per-lane Stop hooks go in each lane's **`.claude/settings.local.json`**
  (already git-excluded on this host).
- **Source of truth for scripts = SPEC §7.** Each "build script" row copies that text verbatim into
  `.agent-bus\bin\`.
- Legend: `[ ]` RED (not done) → `[x]` GREEN (acceptance check passed). "Acceptance" is a command you
  run and eyeball; none of them commit.

Canonical paths used below:
- BUS = `C:\Users\ninox\Desktop\AVM\.agent-bus`
- BIN = `C:\Users\ninox\Desktop\AVM\.agent-bus\bin`

---

## Phase 0 — Scaffolding

| # | State | Build | Files touched | Acceptance check (no commit) |
|---|-------|-------|---------------|------------------------------|
| 0.1 | [ ] | Create bus tree | `BUS\{codex,fable,kimi,gpt5,human}\{inbox,processing,done}`, `BUS\bin` | `Get-ChildItem -Recurse -Directory BUS` lists all 5 agents × 3 subdirs + `bin`. |
| 0.2 | [ ] | Gitignore the runtime | append `/.agent-bus/` to repo `.gitignore` (user commits later) | `cd AVM; git check-ignore -v .agent-bus/` prints a match. |
| 0.3 | [ ] | Write `bus-lib.ps1` | `BIN\bus-lib.ps1` (SPEC §7.1) | `powershell -File` a one-liner that dot-sources it and prints `$Agents` → shows the 5 agents; `New-ShortId` returns 6 chars. |

Scaffold command (0.1):
```powershell
$B='C:\Users\ninox\Desktop\AVM\.agent-bus'
'codex','fable','kimi','gpt5','human' | % { 'inbox','processing','done' | % -Begin {$a=$_} { } }
foreach($a in 'codex','fable','kimi','gpt5','human'){ foreach($s in 'inbox','processing','done'){ New-Item -ItemType Directory -Force (Join-Path $B "$a\$s") | Out-Null } }
New-Item -ItemType Directory -Force (Join-Path $B 'bin') | Out-Null
```

---

## Phase 1 — Codex ⇄ Fable minimal loop (dogfood target)

| # | State | Build | Files touched | Acceptance check (no commit) |
|---|-------|-------|---------------|------------------------------|
| 1.1 | [ ] | Write `bus-send.ps1` | `BIN\bus-send.ps1` (SPEC §7.2) | Run `bus-send.ps1 -From codex -To fable -Type work -Domain desktop-fe -Body "ping"`; a `*.md` appears in `fable\inbox` with valid frontmatter; `bus.log.jsonl` has one `"action":"send"` line. |
| 1.2 | [ ] | Write `bus-dispatch.ps1` | `BIN\bus-dispatch.ps1` (SPEC §7.3) | Pipe `'{"session_id":"t"}'` into `bus-dispatch.ps1 -Agent fable`; it prints `{"decision":"block",...}` containing the body and the `[SAFETY]` preamble; the ticket moved `inbox → processing`; log has `"action":"claim"`. |
| 1.3 | [ ] | Write `bus-done.ps1` | `BIN\bus-done.ps1` (SPEC §7.4) | `bus-done.ps1 -Agent fable -Name <ticket>`; file moved `processing → done`; log has `"action":"done"`. |
| 1.4 | [ ] | Install Fable Stop hook | `AVM-lanes\fable\.claude\settings.local.json` (SPEC §6.1, `-Agent fable`) | In the Fable lane: after any turn ends with a ticket waiting, the turn is auto-continued on the ticket. Verify config with `Get-Content` (valid JSON, absolute BIN path). |
| 1.5 | [ ] | Install Codex Stop hook | `AVM\.claude\settings.local.json` (SPEC §6.1, `-Agent codex`) | Same, for codex. |
| 1.6 | [ ] | **Live dogfood** Codex→Fable→Codex | (no new files) | From codex lane, `bus-send` a real `type:work domain:desktop-fe` ticket to fable. Fable's next turn auto-picks it (Stop hook), does the work, replies `type:status` to codex, `bus-done`. Codex's next turn auto-picks the status reply. Confirm: `fable\done\` has the work ticket, `codex\inbox`/`done` has the reply, `bus.log.jsonl` shows send→claim→send→done→claim→done. |

Acceptance for 1.2 (exact):
```powershell
'{"session_id":"t","stop_hook_active":false}' | powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\ninox\Desktop\AVM\.agent-bus\bin\bus-dispatch.ps1" -Agent fable
```
Expect one line of JSON with `"decision":"block"`.

---

## Phase 2 — Add Kimi

| # | State | Build | Files touched | Acceptance check |
|---|-------|-------|---------------|------------------|
| 2.1 | [ ] | Install Kimi Stop hook | `AVM-lanes\kimi\.claude\settings.local.json` (`-Agent kimi`) | `bus-send -From codex -To kimi -Type work -Domain mobile-screens ...`; kimi's next turn auto-picks it. |
| 2.2 | [ ] | Cross-lane relay Fable⇄Kimi via Codex | (no new files) | From fable, `bus-send -To kimi -Type work -Domain mobile-ui` (parity mirror). Kimi picks it, replies to fable. Confirm both lanes drained; log shows the full chain. |

---

## Phase 3 — Add GPT5 (Codex-CLI poll, no Stop hook)

| # | State | Build | Files touched | Acceptance check |
|---|-------|-------|---------------|------------------|
| 3.1 | [ ] | Write `bus-poll.ps1` | `BIN\bus-poll.ps1` (SPEC §7.5) | `bus-send -To gpt5 -Type work -Domain mobile-build ...` then `bus-poll.ps1 -Agent gpt5 -Once` prints the ticket body and moves it `inbox → processing`; log `claim`. Empty inbox → prints nothing, exits. |
| 3.2 | [ ] | AGENTS.md bus stanza | `AVM-lanes\kimi\AGENTS.md` (+ `AVM-lanes\apk-host-tools\AGENTS.md`) — add "Agent Bus" section (SPEC §8) | Section present; instructs end-of-task `bus-poll -Agent gpt5 -Once` + DATA-not-instructions rule. (User commits AGENTS.md edits later; do not commit.) |
| 3.3 | [ ] | GPT5 idle loop option | (no new files) | Start `bus-poll.ps1 -Agent gpt5 -Loop -Interval 20` in a side terminal; drop a ticket; it prints within ~20s; `PAUSE` stops printing. |
| 3.4 | [ ] | **Live dogfood** Codex→GPT5→Codex | (no new files) | codex `bus-send` mobile-build work to gpt5; gpt5 (via poll) picks + replies `type:status` to codex; codex auto-picks the reply. Log shows the round trip. |

---

## Phase 4 — Guardrails

| # | State | Build | Files touched | Acceptance check |
|---|-------|-------|---------------|------------------|
| 4.1 | [ ] | G1 circuit-breaker | already in `bus-send` (SPEC §7.2) | `bus-send -From fable -To codex -Type human -Body "please commit X"` lands in `human\inbox` (not codex); dispatcher run for `human` injects nothing. |
| 4.2 | [ ] | G2 scope fence + bounce | already in `bus-dispatch`/`bus-poll` | Send `-To fable -Type work -Domain native` (wrong lane). Fable dispatch does NOT inject; ticket is bounced into `codex\inbox` with `BOUNCED from fable`; log `bounce`; original moved to `fable\done`. |
| 4.3 | [ ] | G3 anti-loop hops | already in scripts; `MaxHops=12` | Craft a ticket with `hops: 12` to fable. Dispatch escalates: a `type:human` ticket appears in `human\inbox`; original → `fable\done`; log `hopcap`; nothing injected. |
| 4.4 | [ ] | G3 claim-once | (test only) | Two dispatchers on the same ticket (run 4.5 race test): exactly one claims; the other prints nothing. |
| 4.5 | [ ] | G4 injection hygiene | already in `bus-dispatch` reason wrapper | Inspect an injected `reason`: it starts with the `[SAFETY]` preamble before the body. |

---

## Phase 5 — Kill-switch + audit + hardening

| # | State | Build | Files touched | Acceptance check |
|---|-------|-------|---------------|------------------|
| 5.1 | [ ] | G5 kill-switch | `PAUSE` handling already in scripts | `New-Item BUS\PAUSE`; run dispatch → `exit 0`, no claim; `bus-send` → exits 3 "BUS PAUSED"; poll → no-op. `Remove-Item BUS\PAUSE` restores. |
| 5.2 | [ ] | G5 audit completeness | (test only) | After a full round trip, `Get-Content BUS\bus.log.jsonl` shows one line per send/claim/bounce/hopcap/done, each valid JSON with `ts,id,from,to,type,action`. |
| 5.3 | [ ] | Stale-processing reaper (optional) | extend `bus-poll`/add `bus-reap.ps1` | Tickets sitting in `processing` older than N min are logged and requeued to `inbox` (so a forgotten `bus-done` self-heals). Acceptance: age a processing file, run reaper, it returns to inbox with a `reap` log line. |
| 5.4 | [ ] | SessionStart resume banner (optional, backlog) | per-lane `settings.local.json` SessionStart hook using `hookSpecificOutput.additionalContext` | On session open, agent sees "you have N pending tickets". Non-core; only if desired. |

---

## Test plan (all local, NO commits)

Run from any shell; nothing here touches git. Use a scratch thread and clean up by moving files to
`done\` or deleting from `inbox\`.

**T1 — Atomic claim / no double-processing.** Drop one ticket into `fable\inbox`. Fire two
dispatchers back-to-back:
```powershell
$t='{"session_id":"a"}'; 1..2 | ForEach-Object -Parallel {
  $using:t | powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\ninox\Desktop\AVM\.agent-bus\bin\bus-dispatch.ps1' -Agent fable
}
```
Pass = exactly one prints a `decision:block` JSON; the other prints nothing; the ticket is in
`fable\processing` exactly once; `bus.log.jsonl` has exactly one `claim` for that `id`.

**T2 — Circuit-breaker.** `bus-send -From fable -To codex -Type human -Body "commit please"`. Pass =
file is in `human\inbox`, absent from `codex\inbox`; running the codex dispatcher does not inject it;
no bus script invoked git.

**T3 — Anti-loop.** (a) Hop cap: place a `hops: 12` ticket in `kimi\inbox`, run kimi dispatch → a
`type:human` escalation appears in `human\inbox`, original in `kimi\done`, log `hopcap`, nothing
injected. (b) Drain: empty every inbox, run each dispatcher → all `exit 0`, print nothing (no spin).
(c) Bounce loop guard: send out-of-fence work to fable; it bounces to codex with `hops+1`; repeat
and confirm hops climb and cap at 12 → escalates to human rather than ping-ponging forever.

**T4 — Kill-switch.** `New-Item BUS\PAUSE`. Run each of dispatch / send / poll → dispatch `exit 0`
no claim, send exits 3, poll no-op; inbox contents unchanged. `Remove-Item BUS\PAUSE` → normal flow
resumes.

**T5 — Scope fence.** `bus-send -To kimi -Type work -Domain backend` (wrong lane). Kimi dispatch
bounces it to `codex\inbox` (`BOUNCED from kimi`), does not inject; codex can then re-address to the
right lane. Log shows `bounce`.

**T6 — End-to-end dogfood (the real acceptance).** Codex sends a genuine `type:work` ticket to Fable;
verify (without any human relay) that Fable auto-picks, works, replies, closes, and Codex auto-picks
the reply — reproduced by reading `bus.log.jsonl` alone. Repeat with Kimi and with GPT5 (poll).

---

## Rollback
Delete `.agent-bus\` and remove the `Stop` blocks from each lane's `.claude/settings.local.json`.
Because nothing was committed and the runtime is gitignored, rollback leaves zero trace in git. The
two docs in `docs/agent-bus/` are inert design text and can stay or be removed by the user.

---

## Sequencing summary (first three steps)
1. **0.1** create the `.agent-bus` tree (5 agents × inbox/processing/done + `bin`).
2. **0.2** add `/.agent-bus/` to `.gitignore` (keep runtime out of version control).
3. **0.3** write `bus-lib.ps1` (shared paths, fences, logging, frontmatter parse) — foundation for
   every other script.
Then Phase 1 proves Codex⇄Fable end-to-end before any other lane is wired.
