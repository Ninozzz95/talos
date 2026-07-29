# R7 research - Tablet Settings category scrolling

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

The tablet Settings category rail must scroll vertically like the established
global sidebar. Phone Settings behavior, the right detail pane, keyboard tab
navigation, the persisted rail width, and safe-area handling must not change.

The current tablet markup has two nested elements claiming vertical scrolling:

- `settings-category-pane` has `md:overflow-y-auto` and
  `md:overscroll-contain`;
- its `TabsList` child also has `md:overflow-y-auto` and
  `md:overscroll-contain`, but the parent is a block rather than a bounded
  column flexbox.

The inner list therefore grows to its content height instead of acquiring a
smaller scrollport. It has no useful scroll range, yet its overscroll
containment can stop a touch/wheel chain before the outer rail moves. The
global sidebar avoids this ambiguity: one bounded `min-h-0 flex-1` navigation
element owns both `overflow-y-auto` and `overscroll-contain`.

## Current primary sources

Accessed 2026-07-29:

1. W3C CSS Overflow Module Level 3:
   <https://www.w3.org/TR/css-overflow-3/>
   - `overflow-y: auto` creates scrolling only when a box has scrollable
     overflow;
   - a usable scroll container consequently needs a constrained scrollport.
2. W3C CSS Flexible Box Layout Module Level 1:
   <https://www.w3.org/TR/css-flexbox-1/#min-size-auto>
   - flex items otherwise retain content-derived automatic minimum sizes;
   - an explicit zero minimum lets the designated flex child shrink and
     overflow inside the available height.
3. W3C CSS Overscroll Behavior Module Level 1:
   <https://www.w3.org/TR/css-overscroll-1/>
   - a container with no potential to scroll is always at its boundary;
   - `contain` prevents scroll chaining to ancestors.
4. WAI-ARIA Authoring Practices, Tabs Pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>
   - vertical tabs retain Up/Down, Home and End navigation;
   - focus must remain on real `tab` elements.
5. Reka UI Tabs documentation for the pinned `reka-ui@2.10.1`:
   <https://www.reka-ui.com/docs/components/tabs>
   - keep `TabsRoot` vertical orientation and the upstream keyboard contract;
     scrolling is an owned layout concern around the existing primitives.

## Upstream decision

**ADOPT directly** the W3C single-scrollport semantics and WAI-ARIA vertical
tabs keyboard contract.

**ADAPT** the already pinned Reka tabs and the repository's global-sidebar
layout:

- make the tablet category `aside` a bounded column flex container;
- keep overflow clipped on that structural container;
- make its `TabsList` the sole `min-h-0 flex-1 overflow-y-auto
  overscroll-contain` scroll owner;
- leave phone classes and the independent detail-pane scroller unchanged.

**REJECT** JavaScript wheel/touch handlers because native CSS scrolling covers
all input methods with lower latency. **REJECT** adding a scroll-area package,
because no new behavior or dependency is required. **REJECT** scrolling the
whole modal body, because it couples category and detail positions and no
longer matches the global sidebar.

No dependency, API, route, persistence schema, capability, or permission is
added.
