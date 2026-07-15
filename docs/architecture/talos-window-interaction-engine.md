# TALOS Window Interaction Engine

TALOS uses `interactjs` 1.10.27 directly for desktop pointer interaction. The
dependency is pinned exactly in `control-plane/package.json` and
`control-plane/package-lock.json`; the lockfile also pins the upstream tarball
integrity hash. License text and provenance are recorded in
`THIRD_PARTY_NOTICES.md`.

## Ownership Boundary

`control-plane/resources/js/composables/useTalosWindowInteractions.ts` is the
thin TALOS adapter. It binds one upstream interactable to each floating frame,
maps upstream drag/resize events into canonical TALOS bounds, and tears the
interactable down when the frame or Vue scope is disposed.

TALOS retains ownership of product semantics:

- `talosWindowTilePolicy.ts` resolves left, right, top, bottom, maximize, and
  fullscreen targets from physical pointer coordinates.
- Dragging into the top edge has one unambiguous target: fullscreen across the
  complete workspace. The pointer path never previews top-half or workspace
  maximize before fullscreen; those layouts remain explicit command targets.
- `talosWindowManager.ts` owns geometry, z-order, persistence, restore bounds,
  docking, minimize, maximize, and fullscreen state.
- Laravel remains the product-state boundary; the upstream library receives no
  credentials, network authority, files, or backend state.
- Peek is a transient TALOS presentation state. It changes window surfaces,
  not text/control opacity, and is never persisted.

No Odysseus AGPL source code is copied into TALOS. Odysseus behavior was used
only as an external product reference; the implementation uses the independent
MIT-licensed upstream package and TALOS-owned policy/state adapters.

### Dependency patch gate

TALOS uses the official `reka-ui` 2.10.1 Drawer and Dialog primitives. That
release can invoke its `aria-hidden` restoration callback once when the modal
target disappears and again during component unmount. The upstream callback is
not idempotent, so repeated mobile-window cycles can leave the workspace hidden
from accessibility APIs and unable to receive focus.

`control-plane/patches/reka-ui+2.10.1.patch` makes that restoration one-shot
without replacing the upstream modal implementation. `patch-package` 8.0.1 is
pinned exactly and runs after a normal install and before both development and
production builds, including installs performed with lifecycle scripts
disabled. The patch file, package version, and lifecycle commands are enforced
by the responsive-window upstream contract test.

Any Reka UI upgrade must first be tested without this patch. The patch may be
removed only when three or more consecutive modal lifecycles restore focus and
leave no `aria-hidden` residue in the real Playwright workspace flow. If the
patch no longer applies cleanly, installation and build fail instead of silently
shipping an unverified modal implementation.

## Operational Gates

### Health gate

- Unit tests prove exact package pinning, adapter import, lifecycle cleanup,
  raw-pointer edge targeting, canonical geometry, malformed persistence, and
  reduced-motion behavior.
- Playwright exercises real upstream pointer events, preview geometry, snap,
  reload persistence, fullscreen coverage, Peek, and exact restore.
- The production Vite build must include the adapter without type or bundle
  errors.

### Upgrade gate

An upgrade must be deliberate. Change the exact version and lock integrity,
review upstream release notes and license, then run the full unit suite,
production build, desktop viewport matrix, reduced-motion gate, and supported
browser matrix. Do not accept a semver range for this direct integration.

### Rollback gate

Rollback restores the prior exact package and lockfile entry together. The
TALOS manager and persisted V2 layout remain the canonical state, so rollback
must not migrate or discard user geometry. The focused adapter/policy tests and
desktop E2E must pass before the rollback is released.

## Security And Failure Behavior

The adapter does not execute strings, call the network, or parse untrusted
content. Non-finite pointer, stage, or persisted geometry fails closed in the
TALOS policy/parser. Escape cancels an active interaction, document listeners
are scope-cleaned, and a missing stage clears the preview instead of mutating
window state.
