# F6 — Tablet resizable sidebar (Claude pattern)

**Opened:** 2026-07-23 autonomously (owner one-time directive: after the F5.x fixes, proceed straight to
the next phase) · **Owner:** Fable (full mobile) · **Mode:** autonomous rite.

## Scope (owner)
On tablet the sidebar must NOT be full-width: persistent LEFT chat panel (search + chat list + bottom
"New chat"), content on the right, VERTICAL DRAGGABLE divider (fixed width, resizable). Reference: the
owner's tablet screenshot (Claude pattern) — panel ≈1/3 width, thin drag handle, list rows with title +
relative time.

## Design (research-first per the blocking rule)
- Breakpoint: ≥768px viewport width = tablet layout (persistent panel replaces the hamburger drawer).
- Width: default 320px, clamp 260–480px, persisted in settings (`shell.tablet_sidebar_width`);
  double-tap on the handle resets to default (common desktop-panel affordance).
- Handle: 44px-wide hit area over a 1px visual divider, `role="separator"` + `aria-orientation=vertical`
  + `aria-valuenow/min/max`, keyboard arrows resize (a11y parity with split-view patterns).
- Panel content: search + ordered chat list (hold dropdown reused) + New chat pill bottom (screenshot).
- Chat stays the persistent surface on the right; stations keep the sheet presentation.

## Status log
- 2026-07-23: ledger opened; F5.3 APK building in parallel.
- 2026-07-24: F5.3 APK delivered (zip + Desktop copy, sha 3b70e231…). Owner sanctioned: F6 now,
  then a severe critical review of ALL phases.
- 2026-07-24: F6 implemented TDD:
  - `lib/tabletLayout.ts` — ONE width contract (260/320/480 + md media query + clamp) shared by
    parser, divider and shell. 7 unit tests.
  - `stores/settings.ts` — `shell.tablet_sidebar_width` parsed fail-closed through the clamp.
  - `composables/useTalosTabletLayout.ts` — matchMedia singleton gate, live rotation flips. 2 tests.
  - `TalosTabletDivider.vue` — role=separator vertical + valuenow/min/max, pointer-capture drag
    (live `resize`, single `commit` per gesture), arrows ±16px, dblclick reset. 4 tests.
  - `TalosTabletSidebar.vue` — brand header + "Open tools" hamburger + EMBEDDED ChatsScreen
    (full reuse: search, ordered list, hold dropdown, archived, device-proven dialogs).
  - `ChatsScreen.vue` — `embedded` prop: select/new emit `activated` instead of routing. 2 tests.
  - `App.vue` — split row [panel | divider | content column]; width = computed from the STORE with
    a drag-only local override (hydration can never desync); `--talos-tablet-rail` var lets fixed
    overlays spare the panel; immersive chrome hides its hamburger on tablet (`hideMenu`).
  - `TalosMobileToolSheet.vue` — station sheets cover only the content area on tablet.
- E2E `mobile-f6-tablet.e2e.spec.ts` 5/5: panel+divider defaults, tools drawer + panel new-chat,
  sheet dismissal on panel selection, drag→420 persisted across reload, keyboard/clamp/dblclick.
  Debug findings worth keeping: raw `page.mouse.*` has NO actionability wait (boot logo swallowed
  the drag — wait visible→detached FIRST), and the width ref+watch hydration desync was killed by
  deriving width straight from the store.
- Gates: vue-tsc clean; unit 1271 passed; entry budget 468.7k/512k. Full e2e suite: 51/52 with one
  parallel-load flake (prompt-enhancer final-send, 3/3 in isolation, phone viewport — not F6).
- 2026-07-24 screenshot pass (ultra-critical eye, two REAL catches):
  1. The fixed composer dock spanned the full viewport UNDER the panel → dock now starts at
     `--talos-tablet-rail` (ChatScreen.vue).
  2. Classic header duplicated the hamburger next to the panel's → `hideMenu` on
     TalosMobileHeader mirrors the immersive chrome. Screenshot v2 verified clean.
- 2026-07-24 SF-critic verdict: FIX-FIRST, 7 must-fix — ALL fixed + re-verified:
  - F1 BLOCKER `min-h-full` clipped the last panel row (stylesheet-order tie) → embedded root
    switches to `min-h-0`; characterized.
  - F2 hold menu smeared viewport-wide via Teleport `inset-x-6` → anchored to the held row rect
    in embedded mode; characterized + screenshot v3.
  - F3 classic header duplicated hamburger AND New Chat → both hidden behind `hideMenu`.
  - F4 21px divider hit area → 33px (grabbable without stealing deep edge taps, F14 trade).
  - F5 commit race (`.finally` wiping a second in-flight drag) → clear only own override; +catch.
  - F6 width-only 768px gate engaged split on landscape phones → `and (min-height: 500px)`;
    `safe-area-inset-left` padding on the aside. Negative e2e for 915×412 + 375×812.
  - F7 tools drawer buried the split full-screen → `md:!w-[380px]` cap with right border.
  - Minors done: F8 touch double-tap (paired pointerups), F10 Home/End/Enter keys + focus ring,
    F11 label unified to "Open menu", F12 bare tap never commits, F13 tablet ignores a
    phone-persisted 'chats' last_route, F9 override cleared when leaving tablet layout.
  - Accepted debt (documented): F16 iOS<14 `addListener` fallback, F17 async-chunk CLS behind
    the boot logo, RTL divider semantics (LTR-only policy).
- FINAL GATES: vue-tsc clean · unit 1276 passed · e2e 54/54 (flake cleared) · budget 469.1k/512k.
- Screenshots: f6-tablet-split-v2.png (clean split), f6-tablet-split-v3.png (anchored hold menu).
