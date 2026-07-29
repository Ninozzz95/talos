# Research dossier - P1 Library accessibility and native export testing

Date: 2026-07-28

Subsystems: TALOS mobile Library UI, chat-scoped media Library, Android
Storage Access Framework adapter.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root causes

The independent post-APK review identified three distinct defects.

1. Interactive controls in both Library surfaces use `size-9` (36 CSS px) or
   `min-h-11`/`size-11` (44 CSS px). In an Android WebView at the normal device
   scale these miss Android's recommended 48dp focus/touch target.
2. `TalosMobileLibraryFileRow` exposes two buttons that trigger the same
   open/select action. In selection mode the thumbnail button has
   `aria-pressed`, but the filename button has no selection label or state.
   Keyboard and screen-reader users therefore receive contradictory semantics.
3. `TalosFileExportPolicyTest` reads `TalosFileExportPlugin.java` as text and
   searches for cleanup strings. This can pass without executing the behavior
   and can fail after harmless formatting/refactoring.

## Current official standards and upstream contracts

### Android accessibility touch targets

Source:
`https://developer.android.com/guide/topics/ui/accessibility/views/apps-views`

Pin inspected: current Android Developers guidance on 2026-07-28.

Android recommends a focusable/touch target of at least 48dp by 48dp for every
interactive element. The visible icon may remain smaller when padding expands
the actual target.

Decision: **adopt directly** for the two Android Library surfaces. Use 48px
layout targets (`size-12`, `min-h-12`, `min-w-12`) while keeping icons and
typography visually compact. Do not globally rewrite shared Button variants,
which would alter unrelated screens.

### WAI-ARIA Authoring Practices button pattern

Source: `https://www.w3.org/WAI/ARIA/apg/patterns/button/`

Pin inspected: W3C APG current page on 2026-07-28.

The pattern requires an accessible name for every button and `aria-pressed` for
a two-state toggle button. The visible label must remain stable as the state
changes.

Decision: **adopt directly**. During bulk selection, both row controls that
select the file receive the stable `Select <filename>` label and the same
`aria-pressed` value. In normal mode both retain `Open <filename>`.

### Android local JVM testing

Source: `https://developer.android.com/training/testing/local-tests`

Pin inspected: current Android Developers testing guide on 2026-07-28.

Android documents that local tests run on the JVM, cannot execute framework
method bodies, and should test accessible production APIs with dependencies
replaced by controlled fakes/test doubles.

Decision: **adapt behind the existing pure Java policy boundary**. Move the
post-picker staged-source decision and cleanup callback into an executable
package-private policy method used by the plugin. Test that method with real
temporary files and an in-memory cleanup fake. No Robolectric/Mockito package
is needed.

### Android Storage Access Framework and Capacitor activity callbacks

Sources:

- `https://developer.android.com/training/data-storage/shared/documents-files`
- `https://capacitorjs.com/docs/plugins/android`

Pins inspected: current documentation on 2026-07-28; repository Capacitor
runtime remains pinned at 8.0.10.

Android defines `ACTION_CREATE_DOCUMENT` as the user-controlled Save-As flow
and documents deletion of a selected document through its content URI when the
provider supports it. Capacitor's supported result flow is
`startActivityForResult` plus an `@ActivityCallback` that receives the original
`PluginCall`.

Decision: **retain the direct integrations**. Preserve the existing picker and
best-effort `ContentResolver.delete`; replace only the non-executable
source-inspection assertion with runtime policy evidence.

## Rejected alternatives

- **Accept 44px because WCAG's generic minimum can be smaller:** this is an
  Android APK, and the platform's stronger 48dp recommendation is the relevant
  product contract.
- **Make icons themselves 48px:** visually noisy; target padding is the
  established Android solution.
- **Change every shared TALOS Button to 48px:** high regression surface outside
  the two Libraries.
- **Put `aria-pressed` only on the thumbnail:** this is the current
  contradictory state; the filename is independently focusable and selectable.
- **Keep source-string inspection as a wiring assertion:** it is not runtime
  evidence and is fragile to formatting.
- **Add Robolectric solely for one pure decision:** unnecessary dependency and
  maintenance cost; the Android guide explicitly supports extracting logic to a
  local-testable seam.

## Compatibility and security requirements

- 320px portrait layouts must not develop horizontal overflow.
- Icons, text size, filters, visual density, and the shared Library style remain
  aligned.
- Every control keeps its native button/input semantics and accessible name.
- Selection state stays synchronized across thumbnail and filename controls.
- Export still revalidates source trust and byte count after the user returns
  from the picker, deletes a partial destination best-effort on either failure,
  and never claims success.
- No dependency, database migration, permission, or protocol change.

