# R7 research - Launcher symbol only

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

The launcher must contain the TALOS symbol only. The `TALOS` wordmark remains
part of the in-app boot animation but was never requested inside the launcher
icon.

The current canonical generator renders the whole completed boot lockup:

- exact rested hex/DAG mark;
- five filled nodes;
- Orbitron `TALOS` outline;
- a composite transform (`scale=0.69`, mark `translateY=-44`) chosen to fit
  mark plus wordmark in the adaptive safe zone.

Deleting only the wordmark path would leave the symbol small and visibly high.
The source boot SVG itself already proves the correct symbol geometry in a
500 x 500 viewBox, centered at `(250, 250)`. Mapping that source viewBox into
the 600 x 600 Android vector requires `translate(50, 50)` and no scale.

Including strokes, the mapped symbol has conservative visual bounds:

```text
left=155.5, top=128.5, right=444.5, bottom=475
width=289 viewport units = 52.02 dp
height=346.5 viewport units = 62.37 dp
```

It is therefore centered and inside the 48-66 dp meaningful-logo range without
the old composite shrink.

## Current official sources

Accessed 2026-07-29:

1. Android Developers, Adaptive icons:
   <https://developer.android.com/develop/ui/compose/system/icon_design_adaptive>
   - every layer is 108 x 108 dp;
   - meaningful logo artwork must be at least 48 x 48 dp and no larger than
     the centered 66 x 66 dp mask-safe zone;
   - vectors and clean edges are preferred;
   - a monochrome layer enables themed icons and may reuse the foreground
     vector.
2. Android Developers, Splash screens:
   <https://developer.android.com/develop/ui/views/launch/splash-screen>
   - splash and launcher icon geometry share the adaptive-icon specification;
   - the system may use the launcher icon during startup, making symbol
     continuity materially visible.

## Upstream decision

**ADOPT directly** Android's 108/66 dp adaptive-layer contract and same-vector
monochrome pattern.

**ADAPT** the AVM-owned generator to emit only the exact rested boot symbol:

- retain the source hex, edges, branch transforms, node sizes and final paint;
- retain one background/accent pair per existing theme alias;
- remove only the launcher wordmark path;
- map the boot's 500 viewBox to the 600 launcher canvas with `(50, 50)`;
- use scale `1` so the symbol is 52.02 x 62.37 dp;
- keep all normal/round/monochrome resource names and alias switching;
- make the Settings preview use the identical symbol-only contract.

**REJECT** raster regeneration or generative image editing: the authoritative
asset is existing vector/code geometry and must stay byte-deterministic.
**REJECT** hand-editing fourteen drawables: the generator remains the sole
source of truth. **REJECT** deleting the Orbitron boot asset/license: the
wordmark remains in the boot animation, only not in the launcher.

No dependency, permission, preference, alias, or runtime code is added.
