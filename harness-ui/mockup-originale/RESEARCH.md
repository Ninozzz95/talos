# TALOS Agentic Harness UI — competitor benchmark

Research target: a production-grade, fully responsive TALOS coding-harness interface using **Calm** as the default theme, while merging the strongest interaction patterns from Pi, Hermes, DeepSeek Harness, OpenClaw, Claude Code and Codex.

This document records the product/UI synthesis behind the HTML mockup. The prototype is frontend-only: buttons, sheets, session switching, approvals, review, terminal/browser surfaces, queues and command actions are simulated; they are deliberately shaped so a real TALOS backend can be wired in without changing the information architecture.

## TALOS visual contract used

From `Ninozzz95/talos`:

- Default theme: `calm`.
- Calm intent: quiet neutral-grey surfaces, typography-led hierarchy, refined TALOS gold/bronze used sparingly as a signature accent, no procedural background decoration by default.
- Calm defaults: comfortable density, soft radius, subtle motion, dark mode, Instrument Sans UI + JetBrains Mono code.
- Preview seed: background `#1e1f22`, accent `#c08b3c`, secondary `#8e9095`, line `#36373b`, effect `none`.
- Portable design-token contract includes semantic palette roles, compact/comfortable/spacious density, a 3rem touch-target accessibility floor, reduced-motion respect, visible focus, text contrast floor 4.5 and non-text contrast floor 3.

Primary TALOS sources:
- https://github.com/Ninozzz95/talos/blob/main/src/lib/talosThemes.ts
- https://github.com/Ninozzz95/talos/blob/main/packages/design-tokens/src/index.ts

## Competitor synthesis

| Competitor | High-value patterns found | Weakness/friction to improve in TALOS | Where reproduced/improved in mockup |
|---|---|---|---|
| **Pi coding agent** | Fast keyboard-first editor; `/` commands; `@` fuzzy file references; `!` and `!!` shell modes; image paste/drag; model/thinking switching; resume/new/name/tree/fork/clone/compact/export; steering and follow-up queues; extensible commands/tools/UI | Terminal density is excellent for experts but discoverability and touch/mobile ergonomics are limited | Command palette, `/` trigger, `@` reference sheet, `!`/`!!` routing, model sheet, session graph, fork/side thread, compact/export/share, steering/follow-up queue, capability hub, 48px touch targets |
| **Hermes Agent / Desktop** | Streaming tool output; multiline TUI; history + interrupt/redirect; persistent memory and user/project modeling; self-improving skills; cron; parallel subagents; multiple terminal backends; messaging gateway; voice; profiles | Breadth can fragment context across skills, memory, channels and runtime backends | One persistent Context rail unifies memory, skills/MCP/plugins, environment proof and subagents; Automations view; voice affordance; local/worktree/Docker/SSH/cloud environments; profile/gateway capabilities |
| **DeepSeek Harness** | “Everything is a plugin”; web UI centered on workspace + chat + tool activity; workspace write mode; visible model/runtime; plugin ecosystem/market; native desktop wrapper patterns | Plugin-first architecture can surface implementation concepts before task intent; dense tool feeds can become noisy | Task-first Mission card, collapsed Activity bundle with expansion, Capability hub + Plugin market, workspace/model/permission pills, Inspector file tree, desktop-to-mobile responsive transformation |
| **OpenClaw** | Gateway architecture; channels; tools/skills/plugins; Control UI + CLI/TUI; multi-agent routing; browser/device nodes; cron; dashboard/board patterns; persistent operational widgets | Very broad assistant surface can overwhelm a focused coding task; many operational surfaces compete for attention | Session Board only when requested, context-aware mobile nav, scoped browser panel, capabilities/gateways in sheet, automations, subagents and session topology without keeping every rail visible |
| **Claude Code** | Natural-language terminal agent; codebase understanding; git workflows; terminal/IDE/GitHub usage; plugins with custom commands/agents; permission and hook concepts; clean mobile composition | Some advanced terminal controls become hard to discover in GUI/mobile; permission/hook/agent controls risk being split across command-only flows; diff review can require extra expansion | GUI Control plane for Agents/Hooks/Doctor, persistent Safety lens, approval card, review center with expanded diff + test/risk gate, compact mobile composer, keyboard command palette preserved |
| **Codex** | Local coding agent; CLI/IDE/desktop/web surfaces; permission/sandbox controls; session commands; review, skills, MCP, model/personality, fork/side, image input; worktree-oriented workflows | Environment/worktree state can become implicit; setup/progress can block or disappear; mobile has little room for terminal-era status density | Always-visible environment proof on desktop and one-tap sheet on mobile; branch/worktree/root shown together; nonblocking run strip; review gate; session topology; capability hub; command palette; bottom mobile navigation |

## Source repos / docs inspected

- Pi: https://github.com/badlogic/pi-mono and coding-agent docs/examples mirrored across current forks; key interaction contract includes `@`, `/`, `!`, `!!`, session tree/fork/compact, images and extension UI.
- Hermes: https://github.com/NousResearch/hermes-agent
- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- DSH Desktop / visual shell reference: https://github.com/anywhere-labs/deepseek-harness-desktop
- OpenClaw: https://github.com/openclaw/openclaw
- Claude Code: https://github.com/anthropics/claude-code
- Codex: https://github.com/openai/codex

User-provided visual references are preserved under `references/` so the redesign package keeps the exact visual context used during synthesis.

## Functional parity map in the mockup

### Session / conversation lifecycle

- Session history, search and new session
- Rename
- Resume-style switching from history
- Main thread + side thread + fork topology
- Context compaction
- Session export to JSON
- Snapshot/share flow
- Follow-up queue and live steering mode
- Stop/interrupt affordance
- Persistent run status and elapsed state

### Coding context

- Workspace, root, branch and worktree proof
- File tree and modified-file counts
- `@file` reference picker
- Images / screenshot context
- Model + reasoning level picker
- Context-window usage
- Memory/project instructions
- Profiles/personality

### Agent execution

- Read, Search, Edit, Test, Browser activities
- Streaming/running tool state
- Inline diff
- Expand/collapse tool activity
- Permission request card
- Read-only / workspace-write / on-request / full-access policies
- Network, local-browser and Git-push scopes
- Subagents/delegation
- Agents / hooks / doctor GUI control plane
- Skills, MCP, plugins, toolsets

### Runtime / shell / environment

- Integrated terminal
- `!command` route to terminal with context semantics
- `!!command` route without context semantics
- Local repo, isolated worktree, Docker, SSH and cloud-sandbox choices
- Setup is represented as nonblocking runtime state rather than a modal blocker

### Review and quality gates

- Review center
- Per-file diff list
- Inline expanded diff
- Comment / open file actions
- Test summary
- Change volume
- Risk summary
- “Verify before done” policy
- Approve-all final gate

### Browser / visual work

- Local URL surface
- Browser preview
- Mobile device preview
- Annotate / inspect actions
- Scoped browser permission

### Automation / operations

- Cron-like automations
- Isolated worktree for scheduled task
- Run now / pause / edit state
- Session Board widgets
- Run health, Git, subagents, context and automation widgets
- Gateways/channels surfaced as capabilities rather than always-visible navigation

### Input and accessibility

- Multiline composer
- 48px touch-target floor
- Safe-area-aware mobile composer/navigation
- `/` command palette trigger
- `@` file-context trigger
- Voice affordance
- File/image attachment affordances
- Keyboard shortcuts (`⌘/Ctrl+K`, `⌘/Ctrl+N`)
- Visible focus states
- Reduced-motion toggle + `prefers-reduced-motion`
- No hover-only critical action
- Responsive behavior from narrow phones through tablet, laptop and wide desktop

## Responsive information architecture

- **>1280px:** sessions + central work surface + persistent Context rail.
- **1041–1280px:** sessions + work surface; Context rail becomes on-demand drawer.
- **781–1040px:** same two-column hierarchy with denser controls; secondary composer pills disappear.
- **<=780px:** single primary work surface; sessions and Context rail are slide-over drawers; fixed bottom task navigation exposes Chat / Review / Terminal / Browser / Altro.
- **<=430px:** composer and approvals compact further; secondary controls move to sheets; no critical state is removed, only deferred one tap.
- **<=360px:** Mission metadata and control grids collapse to one/two columns while preserving touch-target floor.

## Product decisions that intentionally go beyond competitors

1. **Environment proof is persistent.** Branch, worktree, root and permission state are treated as safety-critical context, not setup trivia.
2. **Activity is progressive disclosure.** A compact timeline shows what the agent did without turning the chat into a log dump; exact diffs remain one tap away.
3. **Review is a first-class gate.** “Done” is downstream of tests + diff + risk, rather than merely the end of model generation.
4. **One control plane unifies terminal-era power.** Agents, hooks, doctor, skills, MCP, plugins and permissions are discoverable in UI while the command palette and shell syntax remain available for experts.
5. **Mobile does not become a cut-down product.** The same functions become drawers, sheets and task views instead of being removed.
6. **Calm stays Calm.** Gold indicates action/status/identity sparingly; no neon dashboard aesthetic, no procedural wallpaper, and code-heavy surfaces use mono typography only where it adds meaning.
