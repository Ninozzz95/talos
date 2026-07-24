# TALOS Mobile — Library (cross-chat document vault) — design

**Owner ask (2026-07-24):** «un vault di documenti consultabile da tutte le chat
esattamente come fa ChatGPT con la funzione libreria, sia inviati che generati
dalla chat.» Vincoli ingegneristici TALOS = ricerca web + parity + **one-up** +
maximum potential (vedi memoria `vincoli-ingegneristici-talos`).

Status: **DESIGN / start of phase.** No implementation yet — this doc opens the
phase per the owner's "open with documentation" rule. TDD begins after this.

---

## 1. Web research (BLOCKING checkpoint — logged)

**Query:** "ChatGPT Library feature files uploaded and generated
cross-conversation how it works 2025".

**Findings (what we must reach parity with):**
- The Library is a **centralized store of uploaded AND generated files**, indexed
  and **persistent across conversations** — files are reusable assets, not
  per-chat inputs.
- Reuse path: in a conversation, the **"+" button → "Recent files"** or **"Add
  from library"** (a searchable list) attaches an existing file without
  re-uploading.
- Any type (PDF, spreadsheet, presentation, image) is auto-saved and indexed.
- Per-file cap 512MB; documents indexed up to a large token budget.
- Rolling out to paid then free tiers.

**Sources:**
- https://tech.yahoo.com/ai/chatgpt/article/chatgpt-makes-it-easier-to-find-and-manage-files-youve-uploaded-across-conversations-144559834.html
- https://www.geeky-gadgets.com/chatgpt-library-feature-guide/
- https://knightli.com/en/2026/05/16/chatgpt-file-library-storage-limits-privacy/
- https://news.aibase.com/news/26502

**Impact on design:** the parity surface is (a) a cross-chat browser of all files,
(b) origin split uploaded/generated, (c) reuse-from-library in the composer "+".
The one-up axes (below) come from data we already hold locally that ChatGPT does
not surface.

---

## 2. What already exists (do NOT rebuild)

The local-first vault foundation is already shipped:

- **`TalosLocalVaultFile`** (`repositories/chatRepository.ts`): global vault row —
  `id, display_name, media_type, size_bytes, private_uri, status, trust, sha256,
  extracted_text, failure_code, metadata, created_at, updated_at`.
- **`repository.listVaultFiles()`** already returns **ALL** vault files globally
  (NOT session-scoped) → the vault is *already cross-chat* at the data layer.
- **`TalosChatAttachmentBinding`** (`session_id, message_id, vault_file_id,
  grant_id, …`) already records **which chat/message references each file** — the
  backlink graph exists.
- **`TalosLocalFileAuthorityGrant`** — explicit per-file permission grants
  (authorize/revoke), the local-first "consent" layer.
- **`talosVaultService.ts`** — `listFiles()`, tray items, pending analysis.
- **`ContextScreen.vue`** — the station currently titled **"Library"**, but it is
  framed as the *current session's* attachment tray (select/deselect for the open
  chat), not a cross-chat browser.
- **`attachmentFileStore.ts`**, **`attachmentAnalysisClient.ts`**,
  `lib/chat/attachmentContracts.ts` — file storage + text extraction.

**Gap summary:** the storage is cross-chat; the *surface* is not, there is no
uploaded/generated origin, no search, no reuse-from-library, and generated
artifacts are not captured into the vault.

## 3. The four parity gaps to close

1. **Cross-chat browser.** ContextScreen → a true Library: list every vault file
   (recency-sorted), media-type icon, size, date, origin badge, and the count of
   chats referencing it. Empty state + pull-to-refresh.
2. **Origin split (uploaded vs generated).** Add `origin: 'uploaded' | 'generated'`
   (stored in `metadata.origin`, no schema migration needed; parsed with a
   fail-closed default of `'uploaded'` for legacy rows). Filter chips: All /
   Uploaded / Generated.
3. **Capture generated files.** When the chat produces a saved artifact (an
   export, a saved code block / document), write it to the vault with
   `origin:'generated'` + a `source_session_id`/`source_message_id` in metadata so
   it backlinks like uploads. (Wire into the existing export path from F4.)
4. **Reuse from library.** Composer "+" → **"Add from library"** opens a searchable
   picker of vault files; choosing one mints a fresh grant + binding for the
   current session/message and attaches it **without re-upload** (dedupe by
   `sha256`). This is the item already stubbed as "Library" in the new "+"
   dropdown (`emit('openContext')`).

## 4. TALOS one-up (beyond ChatGPT parity)

Local data we already hold lets us exceed the reference:
- **Backlinks surfaced.** Show "used in N chats" and let the user jump to those
  chats — ChatGPT hides this. We already store `TalosChatAttachmentBinding`.
- **Search inside documents.** `extracted_text` is already persisted → full-text
  search over file *contents*, not just names.
- **Trust + consent visible.** `trust: 'untrusted'` + grant status shown per file;
  revoke a file's authority from the Library (kills all its bindings).
- **Local-first / no account.** Everything is on-device (SQLite + private URIs),
  no cloud upload, no tier gating — a structural advantage, not a copy.
- **Integrity.** `sha256` dedupe means re-adding the same file reuses one vault row
  (storage-honest), and detects tampering.

## 5. Surface / UX (desktop-parity + calm language)

- **Library station** (rework `ContextScreen`): header "Library" + search field +
  origin filter chips. Rows: icon, name, `origin` badge, size · date, "used in N".
  Row tap → detail sheet (preview if image/pdf, extracted-text peek, backlinks,
  Delete = revoke grants + remove). Long-press → quick actions.
- **Composer "+" → Add from library**: the picker (searchable list, multi-select),
  "Recent files" first, then all. Confirm → attach to the draft.
- Must reuse `TalosMobileScreen`, `--talos-*` tokens, the motion-v6 interaction
  engine, and the existing confirm-dialog / modality-surface contracts. No new
  native `<select>`, no bespoke CSS animations.

## 6. Plan (TDD, one cohesive block — no fragmentation)

- **L1** — vault origin: `parseVaultOrigin` (pure, fail-closed) + repository
  read/write of `metadata.origin`; characterize legacy default. *(RED→GREEN)*
- **L2** — Library store/service: `listLibrary({ query, origin })` over
  `listVaultFiles()` + binding counts + extracted-text search (pure filter fn
  tested in isolation). *(RED→GREEN)*
- **L3** — Library station rework (browser + search + filter + detail + delete
  with grant revocation). Component tests.
- **L4** — Reuse-from-library: "Add from library" picker + attach existing vault
  file (grant+binding mint, sha256 dedupe) wired to the composer "+" item.
- **L5** — Capture generated artifacts into the vault (`origin:'generated'` +
  backlink metadata) from the export/save path.
- **L6** — Gates (tsc/unit/e2e/build) + APK + SF-critic review.

**Out of scope (backlog):** thumbnails/camera/paste one-up (N1.5b), Ollama
`/api/show` modality, streaming preview of large docs.

## 7. Open questions for the owner (non-blocking; sensible defaults chosen)

1. Delete semantics: remove the vault file entirely (and its bindings) vs. keep
   the file but revoke authority? **Default:** offer both — "Remove from library"
   (delete) is primary; the detail sheet also has "Revoke access".
2. Generated capture scope: only explicit exports, or also every saved code block?
   **Default:** start with explicit exports/saves (deterministic), expand later.
3. "Recent files" window in the picker: last N used. **Default:** last 8 by
   binding recency.
