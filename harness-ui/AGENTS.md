# TALOS desktop (harness-ui) — working rules

This directory is the desktop/web harness: Node server (`server.mjs`, `src/`),
vanilla JavaScript frontend (`frontend/`), shared kernel (`src/kernel/`, also used
by the mobile app: do not change its contracts without a recorded handoff).

## Product rules

- Respect the existing design system (Calm theme, `frontend/src/styles/`): change
  structure, never the visual language. Every surface is verified in BOTH light
  and dark themes, at 1024x800 and 1440x900.
- No technical names on screen: tool ids, event types and provider ids are
  mapped to human labels in one place; the raw name is at most a secondary detail.
- More than two actions on an object go into an overflow menu (`...`) plus a
  right-click menu, never a row of buttons.
- Every entity a user sees (notes, tasks, memory, library, sessions, providers)
  has complete create / open / edit / delete from the product. "There is no route"
  is not an answer: add the route.
- No fake feature: no panel without a real route, worker or persistence behind it;
  an empty or failing state says what happened and what to do next.
- Views that come from a mockup are compared side by side with the mockup
  (same view, theme and width) with a table of explained differences.

## Verification

- Backend: `node --test tests/*.test.mjs` (kernel: `npm run test:kernel`, three
  pre-existing failures are known and listed in the ledger).
- Frontend: `cd frontend && npm run test:unit`; build with `npm run build` from a
  clean worktree and copy `dist/` into `public/`.
- Runtime: after a change, the live server on port 4174 is restarted with the
  new backend, the page is opened and the console read; screenshots in both
  themes are inspected before a task is declared closed. Probes against 4174 are
  GET-only; every POST goes to a bench server on its own port.
- Never print a secret on a command line or in a log; API keys live in the
  keyring or the environment.

## UI Regression Prevention

- For UI work, verify the full human-visible path at desktop viewports of 1024×800 and 1440×900, including reload, persistence, reduced-motion, keyboard, and failure states where relevant.
