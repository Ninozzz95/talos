# R7 design - Centered symbol-only launcher

## Canonical asset

Keep `talos.boot-final-frame/1`, the boot mark and boot wordmark metadata. Amend
the `adaptive` contract:

```json
{
  "content": "mark-only",
  "scale": 1,
  "pivotX": 300,
  "pivotY": 300,
  "visualBounds": {
    "left": 155.5,
    "top": 128.5,
    "right": 444.5,
    "bottom": 475
  }
}
```

Set the launcher mark translation to `(50, 50)`. The in-app boot component
does not consume this translation and remains unchanged.

## Generator and preview

`foreground_vector(accent)` emits the existing mark body only. Theme presets
retain id, background and accent; the now-unused launcher text role is removed
from generator tuples. Generated normal, round and monochrome adaptive
resources retain their identifiers.

`TalosLauncherIconDialog` renders the same adaptive transform and mark body,
with no wordmark element or text-color computation.

## Permanent scenarios

- `LAUNCHER-SYMBOL-01 every generated foreground excludes the wordmark`
- `LAUNCHER-SYMBOL-02 exact boot mark geometry and final paint remain`
- `LAUNCHER-SYMBOL-03 centered mark is 48-66 dp and inside safe zone`
- `LAUNCHER-SYMBOL-04 Settings preview contains exactly the same mark`
- `LAUNCHER-SYMBOL-05 all theme aliases/normal/round/monochrome resources stay`
- Existing generator byte-check and LF-only determinism remain green.

## Rollback

Restore the prior composite transform, generator wordmark path, preview path,
canonical bounds and generated foregrounds. No preference or alias cleanup is
needed.
