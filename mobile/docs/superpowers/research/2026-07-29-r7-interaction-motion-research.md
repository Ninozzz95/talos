# R7 research - composer and Settings interaction motion

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local root cause

The requested focus and Settings transitions are currently abrupt for four
independent but related reasons:

1. `TalosMobileComposer` changes `composerFocused`, then synchronously adds or
   removes its control row with `v-if`; only textarea resizing runs afterward.
2. `TalosMobileSettingsCenter` switches the phone panes with `hidden`/`block`,
   while Reka tab panels in Settings Center, Appearance and Model Lab have no
   active-state animation contract.
3. Motion V6 already owns the canonical `composer-expand`,
   `composer-collapse` and `tab-change` intents, but
   `talosInteractionMotionStyleV6` does not publish their duration, easing or
   entry-pose tokens to product CSS.
4. The shell computes interaction tokens from a newly-created default
   preference object rather than `settingsStore.state.motion_v6`. Therefore
   the visible Interface motion switch, duration, profile and per-category
   gates do not govern actual product micro-interactions.

The fix must not animate `height`, `width`, margin, padding, grid tracks or
text layout. The final geometry and text wrapping must be committed before the
first animated frame. Composer compact/expanded geometry can then be bridged
with a FLIP-style measured vertical translation; Settings can animate only the
incoming final-layout panel with the existing tab pose and opacity.

## Current official and maintained references

Accessed 2026-07-29:

1. Vue, Transition:
   <https://vuejs.org/guide/built-ins/transition.html>
   - state-driven enter/leave transitions are a built-in Vue contract;
   - `transform` and `opacity` avoid per-frame layout calculation;
   - animating `height` or margin triggers layout and should be used with
     caution.
2. Reka UI, Tabs:
   <https://reka-ui.com/docs/components/tabs>
   - tab content exposes stable `data-state="active|inactive"` hooks and
     supports animation techniques through its Presence boundary;
   - controlled tabs retain automatic activation and complete keyboard
     navigation.
3. web.dev, How to create high-performance CSS animations:
   <https://web.dev/articles/animations-guide>
   - recommends restricting smooth UI animation to compositor-friendly
     `transform` and `opacity`;
   - warns that layout- or paint-triggering properties undermine smoothness.
4. Android Developers, Animation modifiers and composables:
   <https://developer.android.com/develop/ui/compose/animation/composables-modifiers>
   - state-targeted content changes use an animated-content boundary;
   - the final target state is the identity used to render incoming content;
   - fade/slide are established appearance and content-change transitions.
5. Android Developers, Customize shared element transition:
   <https://developer.android.com/develop/ui/compose/animation/shared-elements/customize>
   - explicitly documents text reflow as an undesirable result of animating
     layout size;
   - recommends keeping text at its final layout size during the transition.
6. W3C WAI, Understanding WCAG 2.2 SC 2.3.3:
   <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions>
   - interaction-triggered non-essential animation must be disableable;
   - OS reduce-motion and an application-wide motion control are accepted
     mechanisms.
7. MDN, `prefers-reduced-motion`:
   <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion>
   - the media feature is widely available and maps Android's Remove
     animations preference to `reduce`;
   - reduced mode should remove or replace non-essential motion.
8. W3C WAI-ARIA APG, Modal Dialog Pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>
   - close normally restores the invoking element;
   - the documented exception is a workflow where the dialog action directly
     leads to a subsequent step and another focus target is more logical.
9. Reka UI, Dialog and Drawer:
   <https://www.reka-ui.com/docs/components/dialog>
   <https://reka-ui.com/docs/components/drawer>
   - `closeAutoFocus` is a supported content event;
   - the event is explicitly preventable, providing the upstream boundary for
     workflow-specific focus transfer without timers.

## Upstream decision

**ADAPT behind the AVM-owned Motion V6 contract**:

- retain lockfile-pinned `vue@3.5.40` (MIT), integrity
  `sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig==`;
- retain lockfile-pinned `reka-ui@2.10.1` (MIT), integrity
  `sha512-drcOQ4rQtDYAcGCsyQBqQg8QQ+H3B+zDaMJU0h8KPEPMa7g9BHu3zcOi4OB39XJSWizceFoNO0Z9tctSGLOXqg==`;
- publish the three already-versioned Motion V6 intent plans as CSS tokens;
- bind those tokens to the actual persisted mobile settings;
- use Reka's active-state hook for Settings panels and a measured,
  compositor-only FLIP translation for composer geometry.

TALOS retains the one-up product behavior: a phone list-to-detail transition
moves focus into the detail pane, and Back restores focus to the selected
category. Tablet tab activation keeps focus on its trigger. Rapid composer
reversals discard stale measurements, and every temporary `will-change`
boundary is removed on completion.

The real browser gate exposed a nested workflow race that component tests could
not model: the sidebar's delayed close autofocus can run after the Settings
detail pane has taken focus. Adapt the upstream preventable `closeAutoFocus`
event only for actions that leave the drawer for a destination. Preserve
ordinary close-to-trigger restoration. This follows the APG logical-workflow
exception and avoids timing guesses or repeated focus calls.

**REJECT** a new animation package, CSS View Transitions as a required runtime
dependency, animated height/max-height/grid tracks, scale transforms over
message text, outgoing/incoming panel overlap, arbitrary hard-coded durations,
or decorative motion that ignores app/OS settings. These respectively expand
the runtime and compatibility surface, risk WebView coverage, force reflow,
distort/re-wrap text, create duplicate focusable content, bypass Motion V6, or
violate reduced-motion policy.

No package, lockfile, protocol or native dependency changes. Conformance is
pinned by source, component, style-token and real Chromium/WebView-equivalent
browser tests plus final physical-device acceptance.
