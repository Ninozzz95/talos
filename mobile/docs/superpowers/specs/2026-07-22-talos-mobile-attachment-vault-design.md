# TALOS Mobile Attachment and Local Vault Design

Date: 2026-07-22
Owner: Codex mobile lane
Status: APPROVED BY EXISTING MOBILE PARITY MANDATE - ready for TDD

## Purpose

P1.6 makes the paperclip, local Vault, message attachment chips and provider
inputs one real local-first pipeline. It mirrors the frozen desktop behavior
without depending on Laravel and without claiming the future M2 encrypted Vault.

## User flow

1. The user taps the paperclip and the operating-system picker opens.
2. TALOS shows one tray item per selected file with `ingesting`, `authorized`, or
   `failed` state. The composer remains usable, but send is blocked while any
   item is ingesting or failed.
3. TALOS copies the file to private app storage, validates and hashes it, extracts
   bounded text when supported, creates a reusable Vault record and creates an
   explicit per-file authority grant.
4. The user can remove a tray item, which revokes that tray grant but keeps the
   reusable Vault file. The Context Vault can attach an existing available file
   with a fresh grant.
5. On send, TALOS atomically persists the user message and every correlated
   file/grant binding. The tray clears only after persistence succeeds.
6. The provider receives canonical text/document/image parts translated by its
   adapter. Unsupported image capability blocks before network I/O with an
   actionable message.
7. Reloading the conversation restores attachment chips from SQLite. Follow-up
   turns can resolve the same authorized content from private storage.

## Storage contract

Schema version 2 adds:

- `talos_vault_files`: provider-neutral file metadata, private URI, SHA-256,
  trust, ingestion/extraction status and bounded extracted text;
- `talos_file_authority_grants`: exact file, permissions, active/revoked state,
  label and timestamps;
- a rebuilt `talos_chat_attachments`: atomic message binding to one Vault file
  and one grant, with immutable display-name/MIME/size snapshots.

Migration preserves any version-1 attachment rows as legacy Vault entries and
legacy message bindings. New writes require an available file and a matching
active grant.

File bytes live under `Directory.Data/talos-vault/files/<generated-id>.<ext>`.
The path never contains the user filename. Files are excluded from Android cloud
backup and device transfer.

## Limits and accepted formats

- maximum 6 files in one composer tray;
- maximum 10 MiB per file;
- maximum 20 MiB total per message;
- maximum 200,000 extracted UTF-16 code units per document;
- maximum 100 PDF pages;
- extraction timeout 15 seconds per file.

Accepted binary formats: PNG, JPEG, WebP, PDF and DOCX. Accepted UTF-8 text
formats: TXT, Markdown, JSON, CSV, HTML, XML and common source-code extensions.
HTML/XML/source are treated as plain untrusted text and never rendered.

## Canonical model parts

`TalosMobileInputPart` is one of:

- `{ type: 'text', text }`;
- `{ type: 'image', attachmentId, name, mediaType, base64, sha256 }`;
- `{ type: 'document_text', attachmentId, name, mediaType, text, sha256 }`.

`ChatTurn` keeps its text compatibility field and gains `parts`. Plain text turns
remain wire-compatible. Attachment hydration occurs after grants are validated
and immediately before provider translation.

## Authority contract

Each selected file receives a random grant with exact `file_id`, permissions
`model.read` and `browser.upload`, active state and user-visible label. Message
persistence requires equal-length, unique file/grant pairs. A grant cannot bind a
different file. Removing a tray item revokes its grant. Deleting a Vault file
revokes all grants before the private bytes are deleted.

All extracted text and all provider file/image inputs are explicitly untrusted.
They cannot issue tool instructions. P1.7 must re-check `browser.upload` before a
Browser action uses a file.

## Failure and recovery

- Picker cancellation is a no-op, not an error toast.
- A rejected file stays visible as failed until removed and cannot be sent.
- If copying, hashing or extraction fails, TALOS deletes partial bytes and stores
  a bounded failure code without leaking paths or parser internals.
- On startup, pending Vault records are reconciled: a complete private file is
  re-analysed once; otherwise it is marked failed and partial bytes are removed.
- Provider failure preserves the user message and its bindings, matching the
  existing durable chat contract.
- Session deletion cascades message bindings but does not delete reusable Vault
  files or grants.

## UI contract

- Composer: desktop-mirrored attachment menu/button and wrap-safe status chips;
  no horizontal overflow at 320/360/390 px.
- Message: file chips render beneath user text using safe metadata only.
- Context Vault: available/failed files, type/size/trust, attach action and delete
  confirmation; no fake context-set API copy.
- Accessibility: 44 px targets, named progress/status regions, removable chips,
  keyboard-operable controls and deterministic focus return after the picker.

## Non-goals

- M2 Rust encryption, folder-wide filesystem grants, OCR, antivirus/CDR and remote
  sync are not claimed by P1.6.
- Browser interaction is P1.7; only its authority permission is recorded here.

