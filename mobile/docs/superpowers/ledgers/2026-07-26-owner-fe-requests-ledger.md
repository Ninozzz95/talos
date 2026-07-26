# Ledger — owner FE requests, part 1 of 3 (2026-07-26)

Owner asked for three things mid-session and gave the GO after the tool batch
closed. This ledger covers the two that are done; the chat media gallery is the
third and lands next.

## 1 — Chat text size gains an "Extra small" step

*"vorrei che aggiungessi un'ulteriore opzione di font size per la chat extra
small"*

`xcompact` at **0.875rem**, below `compact` (0.9375). Like every other step it
is multiplied by the global `--talos-ui-scale`, so the owner's system-wide font
control still moves it.

The four sizes now live in `TALOS_CHAT_TEXT_SCALE_REM` in `talosChatLayout.ts`.
They used to be a nested ternary inside the message list's inline `:style`; a
fourth branch is where that expression stops being readable, and the settings
panel already renders whatever `TALOS_CHAT_BUBBLE_SCALE_OPTIONS` contains, so
the new step appeared in Settings with no edit there at all. `sanitizeTalosChatLayout`
now validates against the option list rather than naming each value twice —
the old form would have silently rejected the new step.

Guard: the test asserts the steps are strictly ordered and all distinct. A
"smaller" option that is not actually smaller is a lie the type system cannot
catch.

## 2 — Reasoning becomes a muted line that opens a drawer

*"la sezione di reasoning nella chat deve essere un semplice testo in grigio o
colore primario sbiadito e se clicco apre un drawer non un collapse esattamente
come Claude"* — with a screenshot of the Claude Android app.

Was: a bordered card with a chevron that expanded in place. Now: a muted row —
no border, no panel, icon + label + trailing chevron — opening the proven bottom
sheet shell. The answer no longer moves when the trace is opened.

`aria-expanded` is deliberately **gone** and `aria-haspopup="dialog"` takes its
place: nothing expands in place any more, and telling a screen reader otherwise
would be a lie in the accessibility tree.

**The row is its own component** (`TalosMobileTraceRow.vue`) because in the same
screenshot the tool-activity line is rendered identically. Those were bordered
chips here, sitting directly above a borderless reasoning row and reading as two
unrelated features; they now use the same row. They pass `interactive: false`,
which drops the chevron and the dialog semantics — **a chevron that opens
nothing is a promise the row cannot keep**, and the tool line has no detail
worth a drawer until the audit trail is surfaced (debt T8, opened yesterday).

Research checkpoint (binding rule): AI-chat reasoning-disclosure patterns, 2026.
Progressive disclosure — a light inline signal first, the full trace on a
dedicated surface — is the recommended shape, which is what the owner's
screenshot already showed. Sources: lollypop.design chatbot UI/UX guide,
thefrontkit AI chat UI best practices, fuselabcreative agent UX, digia
bottom-sheets-vs-modals.

### One thing was reverted during the work

The drawer shell was briefly an async component, "to keep it out of the chat
chunk". That bought **nothing** — the composer drawers already import the same
shell eagerly, so the module is in the chunk regardless — and it cost a
component whose open state could not be asserted in a unit test. Laziness that
saves no bytes is a slower path with worse tests. Reverted to a static import
and the reason written into the file, so it does not get "optimised" back.

## Desktop parity — divergence declared, not hidden

`src/lib/talosChatLayout.ts` is a desktop-ported file guarded by a checksum
manifest, and the fourth step turned the build red. That guard did its job.

Two findings while updating it:

1. The desktop (`control-plane/resources/js/lib/talosChatLayout.ts`) has **three**
   steps and no extra-small.
2. The manifest's claim that the mobile file was *"whitespace-identical to
   desktop (pure port)"* was **already false before this change**: mobile labels
   the steps Small/Default/Large where desktop says Compact/Balanced/Expanded,
   and desktop also carries `advanced_rail_expanded`, which has no mobile
   surface. The checksum matched, so nobody had looked.

The manifest now states the divergence in full.

### Ticket for Codex — KX-DESK-01 (desktop parity, chat text size)

- **What:** add a fourth chat-text step, extra small, below Small, on the
  desktop `talosChatLayout.ts`, and move the sizes to a shared map as mobile did.
- **Why:** owner request 2026-07-26 on mobile; the desktop→mobile parity rule is
  bidirectional, and this file is a tracked port.
- **Care:** desktop labels are Compact/Balanced/Expanded — decide whether to
  align the naming with mobile (Small/Default/Large) or leave it; either way,
  record the choice, because the manifest has been silently claiming the two
  files are identical while they were not.
- **Blocking:** no. Mobile ships independently.

## Gates at close

tsc 0 · unit 1605 passed / 2 skipped · build 516,933 / 560,000 JS · 126,036 /
150,000 CSS · parity ok · ported-lib conformance green.
