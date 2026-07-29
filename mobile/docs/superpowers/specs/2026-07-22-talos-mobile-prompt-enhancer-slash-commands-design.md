# TALOS Mobile Prompt Enhancer and Slash Commands Design

Date: 2026-07-22
Owner: Codex mobile lane
Research: `docs/superpowers/research/2026-07-22-mobile-prompt-enhancer-slash-commands-research.md`
Status: APPROVED BY EXISTING MOBILE PARITY PROGRAM - ready for TDD

## User-visible contract

The phone composer gains an icon-only **Improve prompt** control and the same
slash-command language as the frozen desktop. The enhancer never silently rewrites
or sends text. It calls the currently selected model, displays a preview with exact
provider/model provenance, then requires one of three explicit choices:

- **Cancel**: close the preview and preserve the draft byte-for-byte.
- **Insert below**: append two newlines plus the enhanced prompt to the current
  draft, matching desktop behavior.
- **Replace prompt**: replace the draft with the enhanced prompt.

Typing `/` at the start of a single-line draft opens the command list. Search covers
slash alias, label, description, category, and capability. Arrow keys move the
active option, Home/End jump, Escape clears the slash input, and Enter activates
only an enabled command. Normal Enter, Shift+Enter, IME composition, cursor editing,
and durable draft behavior remain unchanged when the menu is closed.

## Runtime architecture

### Prompt enhancement

`promptEnhancement.ts` owns limits, trusted instructions, JSON encoding, strict
parsing, and the canonical result. `ChatController.enhancePrompt()` snapshots the
selected profile/model, retrieves the existing secure credential and endpoint,
dispatches one provider completion through the existing adapter, validates the
reply, and publishes a provenance-bearing preview. It does not call `ChatStore.send`
and therefore creates no session, message, attachment, activity, or run row.

The controller uses a monotonic request revision. A later enhancement or explicit
clear supersedes an older response. A stale success or failure cannot overwrite the
current preview. Provider errors pass through the existing credential-redacting
normalizer.

### Slash commands

`mobileCommandRegistry.ts` is the mobile capability truth. It preserves frozen
desktop IDs and copy while adding mobile-specific disabled reasons. The command
registry, not the menu, determines availability.

`mobileSlashCommands.ts` owns aliases and pure filtering. The menu renders the
filtered list but never changes capability state. The composer owns active-index
keyboard behavior and emits only an enabled command ID.

Enabled in this slice:

- `/new` -> create a real durable local chat session.
- `/context` -> open the real Context route/tool sheet.
- `/model` -> open Settings directly on the Models panel.

All other aliases remain visible and disabled until their owning mobile runtime is
real. `send_message` and `open_shell_policy_panel` intentionally have no slash alias,
matching the frozen desktop.

### Bundle boundary

`TalosMobilePromptEnhancerPopover.vue` and `TalosMobileSlashCommandMenu.vue` are
loaded with `defineAsyncComponent`. The manifest gate requires each source file to
be a reachable dynamic entry and absent from the initial static closure. Unit
fixtures fail if either component becomes eager.

## State and failure behavior

- Empty or over-12000-character prompts fail before network dispatch.
- Missing/uncallable selected model, missing credential, missing endpoint, or stale
  catalog fails with the same actionable provider configuration language as chat.
- The enhancer response accepts a raw JSON object or a whole-output `json` code
  fence only. It rejects arrays, unknown keys, missing/empty enhanced text, overlong
  values, more than eight principles, and malformed JSON.
- The preview retains the exact original prompt and model provenance.
- Failure never changes or sends the draft and never writes a chat row.
- Switching sessions, creating/deleting a session, or sending clears any enhancer
  overlay so one session cannot display another session's preview.
- Unsupported slash commands cannot emit, navigate, open a fake panel, or clear the
  draft through a pointer click.

## Responsive and accessibility behavior

- Controls remain icon-only and at least 44 by 44 CSS pixels.
- The menu is a named single-select listbox with flat options and no nested controls.
- Disabled commands remain readable and expose their exact reason.
- Preview content scrolls internally, preserves whitespace, wraps long tokens, and
  remains within `calc(100vw - 1.5rem)` and a bounded viewport height.
- Loading/error/result states use a polite live region; the preview uses a labelled
  dialog surface. Cancel/Insert/Replace restore focus to the composer.
- Verification covers 390x844 and 360x640 with zero document-level horizontal
  overflow.

## Self-review decisions

- The design does not persist enhancement history. Desktop does not expose it as a
  durable user artifact; persisting it would add product behavior rather than parity.
- The design does not retry malformed output automatically. Silent retries add cost
  and can produce a different rewrite without explicit user intent.
- The design does not execute free-form slash arguments. Browser URL execution and
  file attachment remain disabled until their approved runtime owners land.
- No desktop, backend, validator, core, package, or native Android file changes are
  required.

---

**Superseded in part, 2026-07-26 (defect #6, `f390c18`).** The registry no
longer mirrors the desktop command set: it lists only the nine commands the
mobile app can execute. `open_shell_policy_panel` and the other twelve
non-existent ids were removed outright rather than shown greyed out, and the
frozen desktop set survives as `TALOS_DESKTOP_COMMAND_IDS`, a parity ledger for
measuring the gap. Anything below describing disabled rows or their reasons
describes a surface that no longer exists.
