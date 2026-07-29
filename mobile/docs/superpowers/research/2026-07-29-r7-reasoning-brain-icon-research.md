# R7 research - Reasoning row Brain icon

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

The Reasoning disclosure row currently renders Lucide's `Sparkles` icon even
though the row represents model thought/reasoning, not a magical effect or
generic enhancement. The same row already owns the correct localized label,
live elapsed state, 44 px action target and bottom-drawer behavior. Therefore
the defect is isolated to semantic icon selection; changing the row component,
state model, persistence or disclosure interaction would create needless
regression risk.

`TalosMobileTraceRow` wraps the icon slot in an `aria-hidden="true"` container.
The localized visible label remains the control's accessible name, so the icon
must stay decorative rather than creating a second spoken label.

## Current official references

Accessed 2026-07-29:

1. Lucide, Brain:
   <https://lucide.dev/icons/brain>
   - identifies the maintained `Brain` glyph with keywords including mind,
     intellect, AI, think, thought and insight;
   - documents the official Vue import and component form:
     `import { Brain } from '@lucide/vue'` and `<Brain />`.
2. Lucide, Sparkles:
   <https://lucide.dev/icons/sparkles>
   - associates `Sparkles` with stars, effects, filters and magic;
   - those semantics do not identify a deterministic reasoning disclosure.
3. W3C WAI, Decorative Images:
   <https://www.w3.org/WAI/tutorials/images/decorative/>
   - an image adjacent to text that already conveys the same information is
     decorative and should be ignored by assistive technology;
   - suppressing redundant announcement reduces audible clutter.

## Upstream pin and decision

**ADOPT DIRECTLY** the `Brain` export from the already installed and
lockfile-pinned `@lucide/vue@1.25.0` package (ISC), integrity:

```text
sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==
```

The package's current declarations contain both `Brain` and `Sparkles`; no
dependency, lockfile, icon asset, network boundary or custom SVG is needed.
The existing AVM-owned trace-row wrapper continues to own layout, interaction
and the decorative `aria-hidden` boundary.

**REJECT** retaining `Sparkles`, selecting a vendor logo, drawing a local brain
glyph, adding a second icon library, or making the SVG independently
accessible. Those options respectively preserve the semantic defect, couple
reasoning to one provider, duplicate maintained upstream work, expand the
runtime surface, or repeat the already visible Reasoning label.

Upgrade conformance is pinned by the exact package version plus permanent unit
and real browser assertions for `lucide-brain`, absence of
`lucide-sparkles`, decorative accessibility, drawer behavior and reload
persistence.
