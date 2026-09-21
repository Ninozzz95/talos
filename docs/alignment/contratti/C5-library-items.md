# C5 - Library items

Delta ID: `DELTA-2026-C5`

Date: 2026-08-04
Author/agent: Codex
Feature ID (parity): `library`
Desktop change: documentation proposal only; source inspected at
`dafb9457c085ea8cb3a539fc7376a8fb76a89c7e`
Mobile reference: read-only source inspected at
`643035bf12f68adfd01a4042739804846b7e8f23`

## 1. Mobile decision

- [ ] no impact
- [x] existing desktop artifacts/Library and mobile Library converge
- [ ] implementation authorized

Owner decision already fixed: **artifacts are the current Library**.

Unified product name: `Library`.
Unified record name: `library_item`.
`artifact` remains a source type for run-produced files; it is not a second
collection or user-facing capability.

Owner decision, 2026-08-04: **one canonical `library_item` with compact typed
provenance selected**. Sync-safe logical identity, SHA-256 content addressing,
content state, relationships, capabilities, and entity/activity/agent
provenance are shared. Storage paths, private URIs, credentials, and ephemeral
session identifiers remain local or are redacted. C2PA status is truthful only
after real verification. This accepts C5 for future desktop and cloud-sync work;
it does not authorize mobile or sync-transport edits in P0.

## 2. Shared contract

- [ ] no contract change
- [x] proposed single contract: `talos.library_item`
- proposed `schema_version`: `1`

### Source schemas, side by side

| Desktop (`@dafb945`) | Mobile (`@643035b`) |
|---|---|
| <pre><code class="language-php">// TalosLibraryItem::toApiArray()
[
  'id' =&gt; (string) $this-&gt;id,
  'source_type' =&gt; (string) $this-&gt;source_type,
  'source_id' =&gt; (string) $this-&gt;source_id,
  'kind' =&gt; (string) $this-&gt;kind,
  'origin' =&gt; (string) $this-&gt;origin,
  'title' =&gt; (string) $this-&gt;title,
  'mime_type' =&gt; $this-&gt;mime_type,
  'byte_size' =&gt; $this-&gt;byte_size,
  'checksum' =&gt; $this-&gt;checksum,
  'source_url' =&gt; $this-&gt;source_url,
  'content_url' =&gt; $this-&gt;contentUrl(),
  'trust_boundary' =&gt; (string) $this-&gt;trust_boundary,
  'occurred_at' =&gt; $this-&gt;occurred_at?-&gt;toJSON(),
  'metadata' =&gt; $this-&gt;metadata ?? [],
  'chat_count' =&gt; (int) $this-&gt;chat_count,
  'backlinks' =&gt; $this-&gt;backlinks ?? [],
  'can_attach' =&gt; $this-&gt;source_type === 'file',
]

// TalosRunArtifact::toApiArray()
[
  'id', 'run_id', 'artifact_type',
  'uri', 'mime_type', 'metadata',
  'created_at', 'updated_at'
]</code></pre> | <pre><code class="language-ts">export interface TalosLocalVaultFile {
  id: string
  display_name: string
  media_type: string
  size_bytes: number
  private_uri: string
  status: 'pending' | 'available' |
          'failed' | 'revoked'
  trust: 'untrusted'
  sha256: string | null
  extracted_text: string | null
  failure_code: string | null
  metadata: Record&lt;string, unknown&gt;
  created_at: string
  updated_at: string
}

metadata.provenance = {
  schema: 1,
  origin,
  createdAt,
  model,
  provider,
  modelVersion,
  originSessionId,
  promptMessageId,
  toolName,
  sourceUrl,
  perceptualHash,
  seal,
}</code></pre> |

Desktop `TalosLibraryProjection` already projects files, generated documents,
run artifacts, browser artifacts, and search results into Library rows. Desktop
artifact promotion additionally records verified SHA-256/size, storage result,
reopen validation, scan result, worker request, and document ID.

### Divergences

| ID | Class | Divergence | Correct semantics and concrete failure |
|---|---|---|---|
| C5-D1 | cosmetica | Desktop exposes both `/artifacts` and `/library`; mobile calls the collection Library/Vault. | Owner decision makes `Library` canonical. Existing artifact routes can remain compatibility/source endpoints. |
| C5-D2 | strutturale | Desktop Library is a projection with `source_type/source_id`; mobile stores the file itself with `private_uri` and extracted text. | Keep one sync-safe logical item plus platform-local storage record. Synchronizing `private_uri` or a server path would expose internals and be unusable on the other device. |
| C5-D3 | semantica | Desktop run artifact API can exist before/without a Library projection; mobile treats saved generated output as a Library item. | The Library projection is correct product semantics. A verified generated artifact must become one Library item or report projection failure; otherwise it is downloadable from one panel but absent from search/attachments. |
| C5-D4 | strutturale | Desktop projection has backlinks/chat count/attachability; mobile has extraction state, local status, and richer origin metadata. | Preserve both as separate relationship, capability, content-state, and provenance sections. A failed extractor must not imply the original bytes disappeared. |
| C5-D5 | semantica | Mobile app metadata records provenance but does not verify a signature; desktop promotion records validation/scan evidence. | Neither is proof of authorship by itself. Canonical provenance must distinguish app assertions, validation evidence, and optional C2PA verification. Calling an unverified metadata field “authentic” would create a false trust claim. |
| C5-D6 | semantica | Temporary mobile sessions intentionally omit session provenance; desktop projection may retain origin session links. | Privacy boundary is correct: ephemeral session IDs must not survive in durable Library provenance. Retaining one would re-identify a conversation promised to disappear. |
| C5-D7 | strutturale | Mobile uses `sha256`; desktop uses `checksum` and promotion metadata `sha256`. | Canonical digest field is `sha256`, lower-case hexadecimal. Legacy checksum maps only when algorithm is proven SHA-256. |

### Proposed unified schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/library-item.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "id",
    "source",
    "kind",
    "origin",
    "title",
    "content",
    "trust_boundary",
    "provenance",
    "relationships",
    "capabilities",
    "occurred_at",
    "metadata"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "id": { "type": "string", "minLength": 1 },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "id"],
      "properties": {
        "type": { "enum": ["file", "generated_document", "run_artifact", "browser_artifact", "search_result"] },
        "id": { "type": "string", "minLength": 1 },
        "url": { "type": ["string", "null"], "format": "uri" }
      }
    },
    "kind": { "enum": ["file", "image", "link"] },
    "origin": { "enum": ["uploaded", "generated", "browser", "search"] },
    "title": { "type": "string", "minLength": 1 },
    "content": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "mime_type", "size_bytes", "sha256", "content_ref"],
      "properties": {
        "status": { "enum": ["pending", "available", "analysis_failed", "failed", "revoked"] },
        "mime_type": { "type": ["string", "null"] },
        "size_bytes": { "type": ["integer", "null"], "minimum": 0 },
        "sha256": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" },
        "content_ref": { "type": ["string", "null"] },
        "text_preview": { "type": ["string", "null"], "maxLength": 4096 },
        "failure_code": { "type": ["string", "null"] }
      }
    },
    "trust_boundary": { "enum": ["user_content", "generated_content", "external_content"] },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "required": ["schema_version", "entity_id", "generated_at", "activity", "agent", "derived_from", "content_credentials"],
      "properties": {
        "schema_version": { "const": 1 },
        "entity_id": { "type": "string", "minLength": 1 },
        "generated_at": { "type": "string", "format": "date-time" },
        "activity": {
          "type": "object",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "enum": ["upload", "tool_generation", "browser_capture", "search_capture", "download"] },
            "tool_name": { "type": ["string", "null"] },
            "session_id": { "type": ["string", "null"] },
            "prompt_message_id": { "type": ["string", "null"] }
          }
        },
        "agent": {
          "type": "object",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "enum": ["user", "model", "tool", "external"] },
            "provider": { "type": ["string", "null"] },
            "model": { "type": ["string", "null"] },
            "version": { "type": ["string", "null"] }
          }
        },
        "derived_from": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "library_item_id": { "type": ["string", "null"] },
              "url": { "type": ["string", "null"], "format": "uri" },
              "sha256": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" }
            }
          }
        },
        "content_credentials": {
          "type": "object",
          "additionalProperties": false,
          "required": ["format", "present", "verification"],
          "properties": {
            "format": { "enum": ["c2pa", "none"] },
            "present": { "type": "boolean" },
            "verification": { "enum": ["not_checked", "valid", "invalid", "unsupported"] },
            "issuer": { "type": ["string", "null"] }
          }
        }
      }
    },
    "relationships": {
      "type": "object",
      "additionalProperties": false,
      "required": ["chat_count", "backlinks"],
      "properties": {
        "chat_count": { "type": "integer", "minimum": 0 },
        "backlinks": { "type": "array", "items": { "type": "object" } }
      }
    },
    "capabilities": {
      "type": "object",
      "additionalProperties": false,
      "required": ["can_attach", "can_preview", "can_download"],
      "properties": {
        "can_attach": { "type": "boolean" },
        "can_preview": { "type": "boolean" },
        "can_download": { "type": "boolean" }
      }
    },
    "occurred_at": { "type": "string", "format": "date-time" },
    "metadata": { "type": "object" }
  }
}
```

`content_ref` is an opaque logical reference resolved locally. It is never a
mobile `private_uri`, absolute server path, signed URL, or bearer secret.

### Fixture valida

```json
{
  "schema_version": 1,
  "id": "library-item-1",
  "source": {
    "type": "run_artifact",
    "id": "artifact-1",
    "url": null
  },
  "kind": "file",
  "origin": "generated",
  "title": "Research report.pdf",
  "content": {
    "status": "available",
    "mime_type": "application/pdf",
    "size_bytes": 24012,
    "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "content_ref": "library-content:library-item-1",
    "text_preview": "Executive summary",
    "failure_code": null
  },
  "trust_boundary": "generated_content",
  "provenance": {
    "schema_version": 1,
    "entity_id": "library-item-1",
    "generated_at": "2026-08-04T14:00:00Z",
    "activity": {
      "kind": "tool_generation",
      "tool_name": "document_create",
      "session_id": "session-1",
      "prompt_message_id": "message-1"
    },
    "agent": {
      "kind": "model",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "version": null
    },
    "derived_from": [],
    "content_credentials": {
      "format": "none",
      "present": false,
      "verification": "not_checked",
      "issuer": null
    }
  },
  "relationships": {
    "chat_count": 1,
    "backlinks": []
  },
  "capabilities": {
    "can_attach": true,
    "can_preview": true,
    "can_download": true
  },
  "occurred_at": "2026-08-04T14:00:00Z",
  "metadata": {}
}
```

### Fixture invalida

Syntactically valid JSON, contract-invalid because it syncs a private device
URI, calls unsigned app metadata `valid` C2PA, and has no content digest.

```json
{
  "schema_version": 1,
  "id": "library-invalid",
  "source": { "type": "artifact", "id": "artifact-2", "url": null },
  "kind": "file",
  "origin": "generated",
  "title": "Invalid",
  "content": {
    "status": "available",
    "mime_type": "application/pdf",
    "size_bytes": 10,
    "sha256": null,
    "content_ref": "file:///data/user/0/ai.talos/files/private.pdf",
    "text_preview": null,
    "failure_code": null
  },
  "trust_boundary": "generated_content",
  "provenance": {
    "schema_version": 1,
    "entity_id": "library-invalid",
    "generated_at": "2026-08-04T14:00:00Z",
    "activity": { "kind": "tool_generation", "tool_name": null, "session_id": null, "prompt_message_id": null },
    "agent": { "kind": "model", "provider": null, "model": null, "version": null },
    "derived_from": [],
    "content_credentials": { "format": "c2pa", "present": false, "verification": "valid", "issuer": null }
  },
  "relationships": { "chat_count": 0, "backlinks": [] },
  "capabilities": { "can_attach": true, "can_preview": true, "can_download": true },
  "occurred_at": "2026-08-04T14:00:00Z",
  "metadata": {}
}
```

Additional semantic validators reject private URI/path schemes in
`content_ref`, require SHA-256 for available byte content, require
`content_credentials.present=true` before `verification=valid|invalid`, and
forbid durable ephemeral-session provenance.

## 3. Execution location mobile

- [x] `local_mobile`: local bytes, extraction, preview, grants
- [x] `trusted_node`: server bytes, projection, scan, promotion
- [x] `remote_provider`: source/agent only, never canonical storage owner
- [x] `unavailable`: content missing or integrity failed

Files may be private; metadata may contain sensitive provenance. Secret paths,
tokens, and provider credentials are excluded from the shared record.

## 4. Sync/conflict

Metadata uses typed field-level merge; content is content-addressed by SHA-256.
Revocation/deletion and privacy redaction win over stale availability. A source
record and Library projection reconcile by `source.type + source.id`; duplicate
logical items become a visible conflict, not two user-facing collections.

## 5. Offline and fallback

Local cached bytes remain previewable offline. Remote-only content is visibly
unavailable. Extraction failure keeps verified original bytes as
`analysis_failed`; it does not report fake searchability or delete generated
output. Provenance verification state remains unchanged offline.

## 6. Tests

- Desktop RED/GREEN: future `LibraryItemContractTest` maps every projection and
  artifact promotion, preserves bytes/digest, strips private storage metadata,
  and validates provenance.
- Mobile RED/GREEN: same fixture decisions, local content-ref resolution,
  incognito provenance redaction, generated-analysis-failure preservation, and
  optional C2PA parsing/verification state.
- Semantic parity: one generated item and one browser item round-trip across
  surfaces without changing digest, origin, or trust state.

## 7. Gate

- The owner Library/provenance contract gate is satisfied by the canonical-item
  decision recorded on 2026-08-04.
- Desktop human: one Library entry, provenance details, truthful analysis and
  credential state, working preview/download/attach actions.
- Mobile physical: same logical item and provenance, local content remains
  private, incognito origin absent.
- Promotion requires byte-level round trip and real C2PA fixture handling when
  credentials are claimed; mocks cannot establish authenticity.

## 8. Rollback

Keep `/artifacts` as a compatibility read/download route and stop new canonical
writes if needed. Never delete source artifacts or Vault files. Rebuild Library
projections from source records after rollback/retry.

## Out of scope

Image editing, new C2PA server signing, cloud sync transport, browser evidence,
and Library UI redesign are not implemented in C5.
