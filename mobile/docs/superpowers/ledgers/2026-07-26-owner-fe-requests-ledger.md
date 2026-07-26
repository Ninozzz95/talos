# Ledger — owner FE requests (2026-07-26)

Owner asked for three things mid-session and gave the GO after the tool batch
closed. All three are here.

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

## 3 — The media of ONE chat, which doubles as that chat's context panel

*"cliccare header quando in versione non immersiva va in una schermata tipo
WhatsApp che mostra tutti i media di quella chat ... che fa capire che sia
relativo a quella chat"*, plus the same entry in the ⋮ menu for both header
modes. The owner asked whether anyone does this. **They do not.**

Research checkpoint: messaging apps have had "Media, links and docs" per chat
for a decade; no AI chat app has it — ChatGPT, Claude, Gemini and Perplexity all
make you scroll the thread to find a file you sent last week. The reported
weakness of WhatsApp's version is that it is a flat chronological dump with no
organisation and no way to retrieve anything. Sources: macrumors on the 2026
WhatsApp media-share redesign, medium/uxsnaps WhatsApp UX breakdowns.

### The one-up

TALOS has something a messaging app does not: these documents are **what the
model of this chat can read**. So the gallery is not an archive, it is the
chat's context panel. Every tile states where the document came from — *"You
uploaded it here"*, *"Made by TALOS here"*, *"From your Library"* — and carries
the switch that puts it in or out of the model's reach. That is organisation
derived from data we already hold, not folders the user has to maintain, which
is exactly the failure of the pattern being borrowed.

### That switch closes debt S7

`metadata.library_shared` has been honoured by the ambient injection and by the
tool suite since each was written, and was **writable from nowhere** — the
register has said so since 2026-07-25.

The trap it was hiding: `updateVaultFile` REPLACES the metadata bag, it does not
merge, and `origin` + `origin_session_id` live in that same bag. A caller writing
`{ library_shared: false }` would have erased where the document came from — and
since `parseVaultOrigin` fails closed to `'uploaded'`, a TALOS-generated file
would quietly start looking like one the user had uploaded, and become **eligible
for injection**, which generated documents must never be. The merge therefore
lives in `vault.setFileShared`, where no caller can get it wrong, with a test
that asserts the origin survives.

Generated files get **no switch at all**, and a line saying "TALOS never re-reads
what it wrote" instead: they are excluded from injection upstream of this flag,
so a control there would change nothing. A toggle that does nothing is a lie.

### "This chat's media" is a union, and either half alone lies

- Files whose **origin** is this chat — uploaded here, or generated here. A
  generated document is never a message attachment, so an attachment query alone
  would hide everything TALOS itself produced.
- Files **attached** here, which may have been picked out of the global Library
  and so carry another chat's origin. Origin alone would hide them.

`talos_vault_files` has no session column — origin lives in metadata JSON — so
this cannot be one query. The metadata half is a pure filter
(`filterLibraryFiles` gained `sessionId` + `alsoFileIds`); the attachment half is
a new repository method, `listSessionAttachmentFileIds`, served by the existing
`(session_id, created_at, id)` index. It is asserted in the **shared contract**,
which runs against all four implementations — the lazy wrapper once dropped an
argument the direct implementations honoured, and the broken one was production.

### Where the entry points are, and why there are two

The immersive chrome — which is the **default** — renders no title at all, so
"tap the header" has no target there. The owner's request already accounted for
this: tap the title in the solid header, and a ⋮ menu entry in both. The title
is now a `<button>` rather than a `<p>`; an invisible tap target on a paragraph
is not an affordance.

### Extracted rather than copied

The thumbnail cache moved out of the Library screen into
`useTalosVaultThumbnails`. It looks like glue and is not: it carries a race
guard for overlapping loads (typing in the search box re-runs the watcher before
the previous previews resolve) and revokes every object URL it created,
including the loser of a race. A second hand-rolled copy in the gallery would
leak blobs on a screen the user opens repeatedly — on a phone that reads as "the
app got slow after a while".

### Ticket for Codex — KX-DESK-02 (desktop mirror, per-chat media)

- **What:** evaluate a per-conversation media/context view for the desktop. The
  desktop's only gallery today is `TalosArtifactGallery.vue`, which is run
  artifacts, not chat media — so this is mobile-first, not a back-port.
- **Why:** desktop↔mobile parity is bidirectional and the owner's idea is a
  product differentiator, not a mobile affordance.
- **Care:** the per-file `library_shared` switch is now writable on mobile. If
  the desktop injection path reads the same flag, it inherits the behaviour
  immediately and should surface the same control, or users will see documents
  silently withdrawn with no way to see why.
- **Blocking:** no.

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

tsc 0 · unit 1627 passed / 2 skipped · parity ok · ported-lib conformance green.
Build and e2e numbers recorded in the commit.
