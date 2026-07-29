# P0 design - Launcher equals the completed boot frame

Date: 2026-07-28

Status: authorized by the owner's sequential autonomous-fix instruction.

## Goal

Every Android launcher alias and its Settings preview must show the same
completed TALOS lockup as the last stable boot-animation frame, remain centered
under every adaptive mask, follow the selected TALOS preset, and support Android
system-themed icons.

## Canonical frame

Create `src/assets/talosBootFinalFrame.json` with schema
`talos.boot-final-frame/1`. It owns:

- the 600 x 600 launcher coordinate system;
- the boot mark translation into that coordinate system;
- the uniform adaptive safe-zone scale and pivot;
- the exact hex, edge, node, and Orbitron wordmark geometry;
- wordmark provenance and layout metadata.

The mark preserves the boot's geometry. The word outline is derived from the
already-pinned Orbitron 600 Latin font with `0.35em` tracking. The composed
visual bounds remain within Android's central 66 x 66 dp safe region after the
uniform transform.

## Generator

`gen_theme_icons.py` reads the canonical JSON and emits:

- a theme foreground with a low-opacity accent hex;
- full accent DAG edges;
- five filled accent nodes;
- the text-role wordmark;
- adaptive and round-adaptive XML with background, foreground, and monochrome;
- unchanged aliases and background-color resources.

`--check` renders expected bytes in memory and fails if any tracked generated
resource is absent or stale. Normal invocation remains the explicit rewrite
operation.

## Settings preview

The confirmation dialog renders the same JSON geometry in an SVG:

- preset background on the container;
- preset accent for hex, edges, and nodes;
- default light/dark text role for the wordmark;
- the same centered safe-zone transform.

Its accessible dialog semantics and actions remain unchanged.

## Compatibility

- activity-alias names and enabled-state behavior stay stable;
- all 14 preset ids and colors stay stable;
- the application and round icon resource names stay stable;
- no app data, schema, permission, native plugin, or restart contract changes;
- boot timing and animation source are not edited;
- Android 8-12 use background/foreground; Android 13+ launchers can use the
  monochrome layer.

## Named acceptance scenarios

- `LAUNCHER-FRAME-01 all theme icons encode the completed boot state`
- `LAUNCHER-FRAME-02 composite stays centered inside the 66 dp safe zone`
- `LAUNCHER-FRAME-03 every adaptive icon exposes a monochrome layer`
- `LAUNCHER-FRAME-04 Settings preview uses the canonical completed frame`
- `LAUNCHER-FRAME-05 generator check detects stale generated resources`
- `LAUNCHER-FRAME-06 launcher aliases and palette mapping remain compatible`

## Human-visible proof

On the physical owner device:

1. compare the launcher's calm icon with the last rested boot frame;
2. repeat after switching to one dark and one light preset;
3. inspect circle and squircle launcher masks;
4. enable Android themed icons and confirm the monochrome lockup stays centered
   and recognizable;
5. confirm there is still exactly one TALOS launcher entry after restart.

## Rollback

Restore only the canonical frame, generator, preview, generated icon resources,
and regression tests. Do not touch launcher preference data or activity-alias
state.
