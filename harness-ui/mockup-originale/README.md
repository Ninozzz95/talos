# TALOS Responsive Agentic Harness Mockup

A frontend-only, highly interactive HTML prototype for a TALOS coding harness, built around the repository's **Calm** visual contract and a feature synthesis of Pi, Hermes, DeepSeek Harness, OpenClaw, Claude Code and Codex.

## Run

Open `index.html` directly in a modern browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

## Files

- `index.html` — complete semantic interface and all views
- `styles.css` — Calm tokens, responsive layout, accessibility, mobile drawers/sheets/navigation
- `app.js` — interaction state, command palette, queue, sheets, approvals, export/share, view switching
- `RESEARCH.md` — competitor analysis, parity map and design rationale
- `UI_REVIEW.md` — engineering polish pass, fixes and responsive QA matrix
- `references/` — the visual screenshots supplied as references

## Things to try

- Resize from 1440px to 320px; the feature set remains accessible.
- Press `Ctrl/Cmd + K` for the command palette; Arrow keys + Enter work inside it.
- Type `/` in the composer to open commands.
- Type `@` to add a file reference.
- Send `!git status` or `!!git status` to route through the terminal simulation.
- Toggle `Follow-up` to queue a steering message while a run is active.
- Open Review, Terminal, Browser, Board, Automations and Settings.
- Change model, permission policy, environment and capabilities from the composer/context rail.
- Open the session tree and create a side thread/fork; rename is handled in a TALOS modal instead of a native prompt.
- Approve or reject the browser permission gate.
- On desktop, toggle the Context Rail from the top bar; on mobile/tablet it becomes a proper overlay panel.
- On touch layouts, focus the composer to exercise visual-viewport/keyboard-safe behavior.
- Use Export session from the command palette to download a mock session JSON.

## Scope

This is a high-fidelity interaction mockup, not a wired agent runtime. Tool calls, Git operations, subagents, browser execution and backend state are simulated. The UI boundaries are intentionally structured so TALOS runtime data/actions can replace the mocked state without redesigning the shell.
