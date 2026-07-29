# P1 Library overflow and sharing-control research

Date: 2026-07-29  
Subsystem: TALOS mobile UI  
Upstream pin: `reka-ui@2.10.1` (already exact-pinned in `package-lock.json`)

## Problem named from local inspection

- The global Library list renders Attach, Save, and Delete as three adjacent
  48 px buttons. At mobile widths they consume the row and separate the action
  contract from the grid, which exposes only Save.
- The per-chat Library renders Save as a row action and the global
  `metadata.library_shared` permission as a full-width native switch below the
  file metadata. The control is visually detached from the file actions.
- Generated files are unconditionally excluded from Library context injection,
  so they must not receive a permission control that cannot change behavior.

## Current primary sources

1. Reka UI Dropdown Menu:
   <https://reka-ui.com/docs/components/dropdown-menu>
   - Provides menu-button semantics, roving focus, checkable items, collision
     handling, controlled state, keyboard navigation, and focus return.
2. W3C WAI-ARIA APG Menu Button Pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/>
   - The trigger is a button with menu semantics; Enter/Space opens into the
     first item, arrow keys navigate, and Escape closes and restores focus.
3. Android accessible views:
   <https://developer.android.com/guide/topics/ui/accessibility/views/apps-views>
   - Interactive controls need a clear purpose and an approximately 48 dp
     minimum touch target.

## Mature product references

1. Google Drive for Android:
   <https://support.google.com/drive/answer/2424384?co=GENIE.Platform%3DAndroid&hl=en>
   - File-level actions are reached from More next to the file.
2. OneDrive mobile:
   <https://support.microsoft.com/en-us/onedrive/use-onedrive-on-android-and-ios-devices>
   - The three-dot file menu groups actions such as sharing, offline access, and
     deletion beside the filename.
3. ChatGPT Library:
   <https://help.openai.com/en/articles/20001052-library-for-chatgpt>
   - Uploaded/generated files are reusable from a central library; files can
     be downloaded and deleted, and workspace controls govern automatic
     Library referencing.
4. Claude Projects RAG:
   <https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects>
   - Project knowledge is presented as a scoped model context capability.
5. Gemini file uploads:
   <https://support.google.com/gemini/answer/14903178>
   - Files are attached and managed as explicit user-provided context.

## Upstream decision

**Adopt directly, through a TALOS-owned adapter.** Use the installed and pinned
Reka Dropdown Menu primitives inside one
`TalosMobileLibraryActionsMenu.vue`. TALOS owns the visual contract, action
schema, localization, touch sizing, destructive tone, and test identifiers;
Reka owns menu semantics, focus, and collision behavior.

Rejected:

- A hand-written absolute-positioned menu: it would reproduce focus,
  type-ahead, keyboard, dismissal, and collision behavior already maintained by
  Reka.
- Hiding the permission state entirely inside More: this would make a
  security-relevant model-context state invisible until interaction.
- Keeping a native switch below the row: it preserves the exact placement
  problem and fragments file actions.
- Offering the checkbox for generated files: upstream injection deliberately
  ignores that flag, so the control would be fake.

## TALOS one-up

Follow the familiar Drive/OneDrive per-file More pattern, but keep the AI
readability state visible as compact row metadata. The checkable action lives in
the menu without burying the current security state. Grid and list expose the
same action set, and a failed persistence write leaves the visible state bound
to stored metadata rather than optimistic DOM state.

