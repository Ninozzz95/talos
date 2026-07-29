# R7 design - composer and Settings interaction motion

Date: 2026-07-29

## Canonical runtime tokens

`talosInteractionMotionStyleV6` resolves the existing intents and publishes:

- `--talos-motion-duration-composer-expand`
- `--talos-motion-duration-composer-collapse`
- `--talos-motion-duration-tab-change`
- `--talos-motion-ease-composer-expand`
- `--talos-motion-ease-composer-collapse`
- `--talos-motion-ease-tab-change`
- `--talos-motion-tab-change-transform`
- `--talos-motion-tab-change-opacity`

The shell passes `settingsStore.state.motion_v6`, not a new default object.
Consequently Interface motion off, profile off, duration scale, intensity and
the Composer/Navigation category gates resolve to zero-duration final-state
tokens immediately and reactively.

## Composer compact/expanded transition

`TalosMobileComposer` retains its exact focused/compact state and conditional
control rows. Its existing `composerCompact` watcher becomes a geometry bridge:

1. measure the composer surface height before Vue commits the state change;
2. await final DOM layout and resize the textarea;
3. measure the final height and calculate `after - before`;
4. animate only the surface's `transform` from that vertical delta to identity;
5. remove the temporary motion attribute and CSS variable on completion.

Because the fixed composer is bottom-anchored, translating the final surface by
the height delta makes its first rendered top edge coincide with the old top
edge. Text is laid out once at final width/height and never scales or reflows
during animation. A monotonic revision suppresses stale asynchronous
measurements during rapid focus/blur or draft changes.

No animation runs for sub-pixel deltas, zero-duration tokens, absent runtime
tokens or OS reduced motion. Focus remains on the textarea through expansion;
blur and native keyboard-dismiss semantics remain unchanged.

## Settings transitions

- Phone category to detail: commit the detail pane, move focus to its
  `tabindex="-1"` root without scrolling, then run one incoming tab animation.
- Phone Back: commit categories, restore focus to the selected category trigger
  without scrolling, then run one incoming tab animation.
- Tablet category changes: Reka retains trigger focus and the newly active
  content uses the shared active-panel animation.
- Settings Center panels, Appearance Design/Motion/Voice panels and Model Lab
  Providers/Catalog panels share `talos-motion-tab-panel`.

The active panel keyframes animate only Motion V6's resolved transform and
opacity into the final identity. The outgoing panel is never kept as a second
interactive tree. Existing automatic activation, scroll-to-top behavior,
category-rail scroll offset, selected state and keyboard semantics stay intact.

## Reduced motion and frame integrity

- Motion V6 app preferences produce immediate tokens at the source.
- `prefers-reduced-motion: reduce` remains a CSS fail-safe and is checked before
  composer geometry motion starts.
- No relevant keyframe or transition may contain height, width, min/max size,
  margin, padding, inset, grid/flex track, font or line-height properties.
- Final DOM state is never delayed on animation completion.
- Animation cancellation cannot roll back state or restore stale focus.

## Acceptance

- Token tests prove default, app-off, category-off and reduced-motion behavior.
- Shell test proves persisted preferences, rather than defaults, own tokens.
- Component tests prove composer focus/blur intent, signed measured delta,
  stale-revision safety, cleanup and focus preservation.
- Settings tests prove pane motion hooks, focus transfer/restore, unchanged APG
  keyboard behavior and all nested tab-panel consumers.
- Browser proof covers phone focus-in/out, Settings forward/back and nested
  section change, tablet tab focus, OS reduced motion, animation keyframes and
  no horizontal overflow.
- Existing composer, Settings, keyboard, tablet, font-size, motion-engine and
  build-budget suites remain green.

## Rollback

Restore only the listed runtime/style/components/tests/docs. The rollback does
not change any stored setting schema or value; the same persisted Motion V6
preferences remain valid.
