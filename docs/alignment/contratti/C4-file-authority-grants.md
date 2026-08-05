# C4 - File authority grants

Delta ID: `DELTA-2026-C4`

Date: 2026-08-04
Author/agent: Codex
Feature ID (parity): `file_authority_grants`
Desktop change: documentation proposal only; source inspected at
`dafb9457c085ea8cb3a539fc7376a8fb76a89c7e`
Mobile reference: read-only source inspected at
`643035bf12f68adfd01a4042739804846b7e8f23`

## 1. Mobile decision

- [ ] no impact
- [x] same capability with a strict mobile subset and two local record shapes
- [ ] implementation authorized

Unified name proposed: `file_authority_grant`.

Desktop supports file, folder, session, and global scopes. Mobile currently
supports per-file local grants. This is a real scope difference, not just two
names; mobile may conform as a subset while advertising supported scopes.

Owner decision, 2026-08-04: **complete canonical grant with declared platform
subsets selected**. Desktop retains `file|folder|session|global`; mobile v1
advertises only `file`. Canonical bindings freeze Library item identity and
SHA-256, while OS paths, content URIs, bearer tokens, and platform permissions
remain local adapters and never sync. This accepts C4 for future desktop and
cloud-sync work; it does not authorize mobile or sync-transport edits in P0.

## 2. Shared contract

- [ ] no contract change
- [x] proposed single contract: `talos.file_authority_grant`
- proposed `schema_version`: `1`

### Source schemas, side by side

| Desktop (`@dafb945`) | Mobile (`@643035b`) |
|---|---|
| <pre><code class="language-php">// TalosFileAuthorityGrant::toApiArray()
[
  'id' =&gt; (string) $this-&gt;id,
  'scope' =&gt; (string) $this-&gt;scope,
  'label' =&gt; (string) $this-&gt;label,
  'permissions' =&gt; array_values(...),
  'status' =&gt; (string) $this-&gt;status,
  'talos_session_id' =&gt; $this-&gt;talos_session_id,
  'files' =&gt; [[
    'id' =&gt; (string) $file-&gt;id,
    'original_name' =&gt; (string) $file-&gt;original_name,
    'mime_type' =&gt; (string) $file-&gt;mime_type,
    'size_bytes' =&gt; (int) $file-&gt;size_bytes,
    'checksum' =&gt; (string) $file-&gt;checksum,
    'status' =&gt; (string) $file-&gt;status,
  ]],
  'expires_at' =&gt; $this-&gt;expires_at?-&gt;toJSON(),
  'revoked_at' =&gt; $this-&gt;revoked_at?-&gt;toJSON(),
  'last_used_at' =&gt; $this-&gt;last_used_at?-&gt;toJSON(),
  'created_at' =&gt; $this-&gt;created_at?-&gt;toJSON(),
  'updated_at' =&gt; $this-&gt;updated_at?-&gt;toJSON(),
]

scopes: file | folder | session | global
permissions: model.read | browser.upload</code></pre> | <pre><code class="language-ts">export interface TalosLocalFileAuthorityGrant {
  id: string
  vault_file_id: string
  permissions: TalosFileAuthorityPermission[]
  status: 'active' | 'revoked'
  label: string
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export interface TalosMobileAttachmentDraft {
  id: string
  source: 'picker' | 'vault'
  displayName: string
  mediaType: string
  sizeBytes: number
  status: 'ingesting' | 'authorized' | 'failed'
  vaultFileId: string | null
  grantId: string | null
  bindingId: string | null
  permissions: readonly TalosFileAuthorityPermission[]
  error: string | null
}</code></pre> |

Desktop persists a pivot `checksum_snapshot` for bound files and verifies it at
authorization time. Mobile validates the current Vault file status/SHA when
building message parts, but the grant record itself does not freeze the hash.

### Divergences

| ID | Class | Divergence | Correct semantics and concrete failure |
|---|---|---|---|
| C4-D1 | cosmetica | Desktop “file authority”; mobile “Library grant”/attachment grant. | Canonical name is `file_authority_grant`; Library is the resource surface, not a different authority model. |
| C4-D2 | strutturale | Desktop grant can bind many files and four scopes; mobile grant binds exactly one `vault_file_id`. | Desktop shape is the complete contract; mobile is a valid `file`-scope subset. Pretending they are identical would make folder/global authority appear supported on mobile when it is not. |
| C4-D3 | semantica | Desktop freezes a checksum snapshot at grant time; mobile reads the current file SHA at use time. | Desktop binding semantics are correct. If bytes behind a mobile file ID change after approval, the current grant follows the replacement; the user approved different bytes. Canonical file-bound grants must freeze SHA-256. |
| C4-D4 | strutturale | Desktop has expiry, last-used, session binding, and revoke timestamps; mobile has active/revoked and timestamps only. | Preserve lifecycle fields; unsupported expiry is `null`, not omitted. This enables deterministic sync and stale-grant cleanup. |
| C4-D5 | semantica | Desktop `global` requires explicit warning acknowledgement; mobile has no global scope. | Desktop warning boundary is correct. A global grant without acknowledgement could expose every future file, not only the files visible when permission was granted. |
| C4-D6 | strutturale | Android SAF/FileProvider URI permission is an OS authority; TALOS grant is an app authority. | Keep them separate. OS URI access does not imply model/browser permission, and a TALOS grant does not imply Android can still read a moved document. |

### Proposed unified schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/file-authority-grant.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "id",
    "owner_id",
    "scope",
    "label",
    "permissions",
    "status",
    "resource_bindings",
    "created_at",
    "updated_at"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "id": { "type": "string", "minLength": 1 },
    "owner_id": { "type": "string", "minLength": 1 },
    "scope": { "enum": ["file", "folder", "session", "global"] },
    "scope_id": { "type": ["string", "null"] },
    "label": { "type": "string", "minLength": 1, "maxLength": 160 },
    "permissions": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["model.read", "browser.upload"] }
    },
    "status": { "enum": ["active", "expired", "revoked"] },
    "resource_bindings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["library_item_id", "sha256"],
        "properties": {
          "library_item_id": { "type": "string", "minLength": 1 },
          "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
        }
      }
    },
    "risk_acknowledged_at": { "type": ["string", "null"], "format": "date-time" },
    "expires_at": { "type": ["string", "null"], "format": "date-time" },
    "revoked_at": { "type": ["string", "null"], "format": "date-time" },
    "last_used_at": { "type": ["string", "null"], "format": "date-time" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

Normative cross-field rules:

- `file` scope requires exactly one resource binding and `scope_id` equal to
  that Library item ID;
- `folder` requires a folder `scope_id` and freezes each resolved file binding;
- `session` requires a session `scope_id` and binds only files explicitly
  selected for that session;
- `global` requires no resource binding and non-null
  `risk_acknowledged_at`;
- authorization re-hashes current bytes and compares with every bound SHA-256;
- grant ID is opaque and owner-bound, never a bearer/capability URL.

### Fixture valida

```json
{
  "schema_version": 1,
  "id": "grant-file-1",
  "owner_id": "user-1",
  "scope": "file",
  "scope_id": "library-item-1",
  "label": "Invoice.pdf",
  "permissions": ["model.read"],
  "status": "active",
  "resource_bindings": [
    {
      "library_item_id": "library-item-1",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "risk_acknowledged_at": null,
  "expires_at": null,
  "revoked_at": null,
  "last_used_at": null,
  "created_at": "2026-08-04T13:00:00Z",
  "updated_at": "2026-08-04T13:00:00Z"
}
```

### Fixture invalida

Syntactically valid JSON, contract-invalid because a global grant carries a
resource binding and has no risk acknowledgement.

```json
{
  "schema_version": 1,
  "id": "grant-global-invalid",
  "owner_id": "user-1",
  "scope": "global",
  "scope_id": null,
  "label": "Everything",
  "permissions": ["model.read", "browser.upload"],
  "status": "active",
  "resource_bindings": [
    {
      "library_item_id": "library-item-1",
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ],
  "risk_acknowledged_at": null,
  "expires_at": null,
  "revoked_at": null,
  "last_used_at": null,
  "created_at": "2026-08-04T13:00:00Z",
  "updated_at": "2026-08-04T13:00:00Z"
}
```

## 3. Execution location mobile

- [x] `local_mobile`: Vault bytes and app grants enforced locally
- [x] `trusted_node`: desktop storage and grants enforced server-side
- [ ] `remote_provider`: never owns the authority record
- [x] `unavailable`: OS URI or file bytes no longer available

Required capabilities: `model.read` and/or `browser.upload`. Files are private;
grant metadata is security-sensitive. No private path/content URI syncs.

## 4. Sync/conflict

Grants are append/revoke records. Revocation wins over activation. A checksum
change produces a visible `resource_changed` conflict and requires a new grant;
it is never auto-merged. Platform URI handles are excluded from sync.

## 5. Offline and fallback

Local grants work offline if local bytes and OS authority still exist. Missing
bytes, changed digest, expired/revoked grant, or lost URI permission fails
closed with an actionable state; no automatic re-pick or re-authorization.

## 6. Tests

- Desktop RED/GREEN: future shared fixture parser plus existing checksum,
  owner, scope, expiry, and global-warning tests.
- Mobile RED/GREEN: same fixture parser, file-scope subset declaration,
  checksum snapshot mismatch, revoke, and lost-URI scenarios.
- Semantic parity: one digest-changing fixture must deny on both surfaces.

## 7. Gate

- The owner file-authority contract gate is satisfied by the declared-subset
  decision recorded on 2026-08-04.
- Desktop human: grant UI names files, scope, permissions, expiry, and risk.
- Mobile physical: selected file, revoked grant, replaced bytes, reload, and
  lost document permission produce truthful visible outcomes.
- Promotion requires both OS authority and TALOS authority tests; one cannot
  stand in for the other.

## 8. Rollback

Retain legacy grant readers and stop canonical writes. Do not reactivate
revoked grants or erase audit records. Mobile file grants remain local and
usable through an adapter while rollback is active.

## Out of scope

Attachment UI, browser interaction confirmation, file ingestion/extraction,
and cloud sync transport are not implemented in C4.
