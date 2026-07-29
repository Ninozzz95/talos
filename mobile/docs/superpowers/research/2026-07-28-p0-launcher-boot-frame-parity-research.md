# P0 research - Launcher and boot-final-frame parity

Date: 2026-07-28

Subsystem: TALOS mobile Android launcher branding

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduced mismatch

The animated boot overlay finishes with one stable lockup:

- the outer hexagon in the theme accent at 18% opacity;
- all DAG edges fully visible;
- five accent-filled, accent-stroked nodes;
- the `TALOS` Orbitron 600 wordmark below the mark in the theme text color.

The generated Android launcher foreground currently differs in four observable
ways: it renders every node as an empty ring, gives the hexagon full opacity,
omits the wordmark, and shifts the mark upward. The Settings preview mirrors
that incomplete launcher asset rather than the boot's completed frame.

## Current primary standards

### Android adaptive icons

Sources inspected 2026-07-28:

- <https://developer.android.com/develop/ui/compose/system/icon_design_adaptive>
- <https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable>

Pins: Android adaptive-icon contract through API 36; app `minSdk=26`,
`compileSdk=36`, `targetSdk=36`.

Android requires 108 x 108 dp foreground/background layers. The central
66 x 66 dp is the mask-safe viewport; the outer 18 dp per side is reserved for
OEM masks and motion. Vectors are preferred, artwork must have clean edges, and
the meaningful logo must remain between 48 and 66 dp.

Starting with Android 13, a launcher can tint a supplied `monochrome` layer
using the user's system theme. The official example permits the same vector to
serve as foreground and monochrome when it remains legible as a single-color
silhouette.

### Maintained platform reference

The Android Open Source Project SystemUI adaptive icon uses the canonical
three-layer contract (`background`, `foreground`, `monochrome`):

<https://android.googlesource.com/platform/frameworks/base/+/eb96fa292fe3/packages/SystemUI/res/drawable-nodpi/icon.xml>

Decision: adopt the platform contract directly in every TALOS per-theme
adaptive icon. Keep launcher alias switching and preset ownership unchanged.

### Orbitron wordmark

Installed upstream pin:

- `@fontsource/orbitron@5.3.0`;
- Orbitron 600 Latin WOFF2;
- SIL Open Font License 1.1;
- package publish hash `8eea555d30e69adc`.

The boot wordmark already renders this exact installed font at weight 600 with
`0.35em` tracking. The launcher path is a deterministic outline of `TALOS`
from that pinned file, not a hand-drawn approximation. The OFL notice is copied
into the repository and recorded in upstream provenance.

## AVM adaptation decision

Adapt behind the existing AVM-owned `gen_theme_icons.py` generator:

1. store one versioned, provider-neutral final-frame geometry asset;
2. retain the boot mark's exact paths and completed paint state;
3. retain the boot wordmark's font, weight, tracking, and relative placement;
4. scale the composite uniformly to fit wholly inside the Android 66 dp safe
   zone, centered on the adaptive canvas;
5. generate the same geometry in all 14 preset palettes;
6. expose that foreground as the Android monochrome layer as well;
7. render the same canonical geometry in the Settings confirmation preview.

The boot's CSS `drop-shadow` glow is intentionally not copied. Android's
adaptive-icon guidance requires clean layer edges, and VectorDrawable has no
equivalent blur/filter primitive. Geometry, opacity, fill/stroke state,
wordmark, palette roles, scale, and centering remain equivalent; the platform
owns mask, tint, and launcher effects.

## Rejected paths

- Raster screenshots: reject because they blur across densities and cannot
  participate cleanly in Android themed-icon tinting.
- A second hand-authored launcher logo: reject because it recreates the drift
  already reported by the owner.
- Removing per-theme aliases: reject because launcher-follow-theme is an
  established user contract.
- Putting artwork outside the safe zone to make it visually larger: reject
  because OEM circle/squircle masks can clip it.

## Health, upgrade, and rollback

- Generator `--check` must prove every tracked generated resource is current.
- Unit tests lock final-frame semantics, all 14 palettes, the 66 dp safe-zone
  transform, Settings preview parity, and the monochrome layer.
- Android resource processing and APK assembly remain real-platform gates.
- An Orbitron upgrade requires regenerating and visually reviewing the outline,
  confirming the new license/provenance, and rerunning the full icon matrix.
- Rollback restores the generator and generated foreground/adaptive resources;
  launcher aliases, stored theme preference, and app data are unaffected.
