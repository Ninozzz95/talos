# C3 - Local models

Delta ID: `DELTA-2026-C3`

Date: 2026-08-04
Author/agent: Codex
Feature ID (parity): `local_models`
Desktop change: documentation proposal only; source inspected at
`dafb9457c085ea8cb3a539fc7376a8fb76a89c7e`
Mobile reference: read-only source inspected at
`643035bf12f68adfd01a4042739804846b7e8f23`

## 1. Mobile decision

- [ ] no impact
- [x] affects the existing desktop Cookbook and mobile Model Lab
- [ ] implementation authorized

The common contract covers catalogue identity, immutable source files, fit
evidence, and transfer state. Execution remains explicitly local to the target:
desktop/trusted node for Ollama, llama.cpp, or vLLM; phone for the mobile
llama.cpp runtime. Preview and execution are never reported as the same event.

Owner decision, 2026-08-04: **shared catalogue and transfer envelopes with
target-specific adapters selected**. Provider/repository/revision/file digests
form canonical identity; transfer jobs, fit evidence, preview/execute mode, and
runtime location remain explicit. This accepts C3 for future desktop
implementation but does not authorize mobile edits or start a transfer during
P0.

## 2. Shared contract

- [ ] no contract change
- [x] proposed contracts: `talos.model_catalog_entry` and
  `talos.model_transfer`
- proposed `schema_version`: `1`

### Source schemas, side by side

| Desktop (`@dafb945`) | Mobile (`@643035b`) |
|---|---|
| <pre><code class="language-php">// TalosModelCatalogEntry::toApiArray()
[
  'id' =&gt; (string) $this-&gt;id,
  'provider' =&gt; $this-&gt;provider,
  'model_id' =&gt; $this-&gt;model_id,
  'display_name' =&gt; $this-&gt;display_name,
  'parameters_b' =&gt; $this-&gt;parameters_b,
  'quantization' =&gt; $this-&gt;quantization,
  'context_window' =&gt; $this-&gt;context_window,
  'runtime_modes' =&gt; $this-&gt;runtime_modes ?? [],
  'estimated_vram_mb' =&gt; $this-&gt;estimated_vram_mb,
  'estimated_ram_mb' =&gt; $this-&gt;estimated_ram_mb,
  'tags' =&gt; $this-&gt;tags ?? [],
  'source_url' =&gt; $this-&gt;source_url,
  'status' =&gt; $this-&gt;status,
  'created_at' =&gt; $this-&gt;created_at?-&gt;toJSON(),
  'updated_at' =&gt; $this-&gt;updated_at?-&gt;toJSON(),
]

runtime_modes:
  ollama | llama_cpp | vllm
status:
  available | disabled | experimental</code></pre> | <pre><code class="language-ts">export interface TalosCatalogueEntry {
  id: string
  family: string
  displayName: string
  publisher: string
  license: string
  paramsB: number
  quantisation: string
  fileBytes: number
  sha256: string
  download: {
    kind: string
    repo: string
    file: string
  }
  runtime: string[]
  contextTokens: number
  ramWorkingBytes: number
  referenceSpeed: Array&lt;{
    soc: string
    engine: string
    tokensPerSecond: number
  }&gt;
  tags: string[]
  addedAt: string
  popularity: number
}

export interface TalosTransferStatus {
  active: boolean
  modelName: string | null
  haveBytes: number
  totalBytes: number
}</code></pre> |

Mobile tool operations copied from
`mobile/src/lib/models/modelTools.ts@643035b`:

- `local_models_search`
- `local_model_inspect`
- `local_model_download`
- `local_models_status`

Desktop endpoints copied from `control-plane/routes/api.php@dafb945`:

- `POST /cookbook/hardware-scan`
- `GET|POST /cookbook/models`
- `POST /cookbook/download-preview`
- `POST /cookbook/serve-preview`
- `GET /cookbook/planning-context`
- `GET /cookbook/dependencies`

### Divergences

| ID | Class | Divergence | Correct semantics and concrete failure |
|---|---|---|---|
| C3-D1 | cosmetica | `parameters_b`/`paramsB`, `quantization`/`quantisation`, `context_window`/`contextTokens`. | Canonical wire uses snake_case; adapters map display/local naming. |
| C3-D2 | strutturale | Desktop record may point to one `source_url`; mobile resolves repository, revision, file or shard set with size and SHA-256. | Mobile source identity is stronger and should lead the common download contract. A mutable URL without revision/digest can download different bytes under the same catalogue ID. |
| C3-D3 | strutturale | Desktop stores estimated RAM/VRAM; mobile stores actual phone working RAM and measured/reference speed by SoC/engine. | Keep estimates and observations as separately typed evidence. Treating a reference benchmark as an actual scan would misstate device fit. |
| C3-D4 | semantica | Desktop `/download-preview` and `/serve-preview` produce plans; mobile tools perform search, inspection, download, verification, and status. | Both are correct for their current implementations, but the operation must say `mode: preview` or `mode: execute`. If preview is marked completed download, UI can offer a model that has no bytes on disk. |
| C3-D5 | semantica | Desktop executes on a machine/trusted node; mobile executes on the phone. | Both are correct and must stay distinct. Combining them into a generic “local” target can schedule a 20 GB model onto a phone after a workstation fit scan. |
| C3-D6 | strutturale | Mobile supports multi-file/sharded transfer and abandoned-job recovery; desktop catalogue has no canonical transfer job. | Common transfer state must be per target and include files, byte progress, verification, terminal fault, and recovery state. |

### Proposed unified catalogue schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/model-catalog-entry.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "id",
    "family",
    "display_name",
    "publisher",
    "source",
    "files",
    "runtimes",
    "requirements",
    "status"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "id": { "type": "string", "minLength": 1 },
    "family": { "type": "string", "minLength": 1 },
    "display_name": { "type": "string", "minLength": 1 },
    "publisher": { "type": "string", "minLength": 1 },
    "license": { "type": ["string", "null"] },
    "parameters_b": { "type": ["number", "null"], "minimum": 0 },
    "quantization": { "type": ["string", "null"] },
    "context_window": { "type": ["integer", "null"], "minimum": 1 },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["provider", "repository", "revision"],
      "properties": {
        "provider": { "enum": ["huggingface", "ollama", "direct"] },
        "repository": { "type": "string", "minLength": 1 },
        "revision": { "type": "string", "minLength": 1 },
        "url": { "type": ["string", "null"], "format": "uri" }
      }
    },
    "files": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "size_bytes", "sha256"],
        "properties": {
          "path": { "type": "string", "minLength": 1 },
          "size_bytes": { "type": "integer", "minimum": 1 },
          "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
          "format": { "type": ["string", "null"] }
        }
      }
    },
    "runtimes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["engine", "locations"],
        "properties": {
          "engine": { "enum": ["ollama", "llama_cpp", "vllm"] },
          "locations": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": { "enum": ["local_mobile", "trusted_node"] }
          }
        }
      }
    },
    "requirements": {
      "type": "object",
      "additionalProperties": false,
      "required": ["ram_bytes", "vram_bytes"],
      "properties": {
        "ram_bytes": { "type": ["integer", "null"], "minimum": 0 },
        "vram_bytes": { "type": ["integer", "null"], "minimum": 0 }
      }
    },
    "tags": { "type": "array", "uniqueItems": true, "items": { "type": "string" } },
    "status": { "enum": ["available", "disabled", "experimental"] },
    "added_at": { "type": ["string", "null"], "format": "date-time" }
  }
}
```

### Proposed unified transfer schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/model-transfer.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "id",
    "model_id",
    "operation",
    "mode",
    "execution_location",
    "state",
    "have_bytes",
    "total_bytes",
    "verification"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "id": { "type": "string", "minLength": 1 },
    "model_id": { "type": "string", "minLength": 1 },
    "operation": { "enum": ["inspect", "download", "serve"] },
    "mode": { "enum": ["preview", "execute"] },
    "execution_location": { "enum": ["local_mobile", "trusted_node"] },
    "target_id": { "type": "string", "minLength": 1 },
    "state": { "enum": ["planned", "queued", "running", "verifying", "completed", "failed", "cancelled", "abandoned"] },
    "have_bytes": { "type": "integer", "minimum": 0 },
    "total_bytes": { "type": "integer", "minimum": 0 },
    "verification": { "enum": ["pending", "verified", "failed", "not_applicable"] },
    "fault_code": { "type": ["string", "null"] },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

### Fixture valida

```json
{
  "schema_version": 1,
  "id": "transfer-1",
  "model_id": "deepseek-ai/deepseek-ocr-gguf",
  "operation": "download",
  "mode": "execute",
  "execution_location": "local_mobile",
  "target_id": "phone-this-device",
  "state": "verifying",
  "have_bytes": 2147483648,
  "total_bytes": 2147483648,
  "verification": "pending",
  "fault_code": null,
  "updated_at": "2026-08-04T12:00:00Z"
}
```

### Fixture invalida

Syntactically valid JSON, semantically invalid because a preview claims a
completed verified transfer with bytes written, and the byte count exceeds the
declared total.

```json
{
  "schema_version": 1,
  "id": "transfer-invalid",
  "model_id": "model-x",
  "operation": "download",
  "mode": "preview",
  "execution_location": "local_mobile",
  "target_id": "phone-this-device",
  "state": "completed",
  "have_bytes": 200,
  "total_bytes": 100,
  "verification": "verified",
  "fault_code": null,
  "updated_at": "2026-08-04T12:00:00Z"
}
```

Cross-field validators require preview records to remain `planned`, with zero
written bytes and `verification=not_applicable`; completed execute transfers
must have exact byte totals and verified immutable file digests.

## 3. Execution location mobile

- [x] `local_mobile`: actual phone search/inspect/download/runtime
- [x] `trusted_node`: actual workstation/server operations
- [x] `remote_provider`: catalogue/source discovery only, behind adapters
- [x] `unavailable`: incompatible model/runtime/target

Required capabilities: network outbound, local storage write, optional trusted
node execution. Model files are private local data; repository metadata is
public unless credentials/gated access are involved.

## 4. Sync/conflict

Catalogue entries merge by immutable source identity
`provider + repository + revision + file digests`. Transfer jobs never merge
across targets; the same model may have independent phone and node transfers.
A digest change under the same identity is a visible integrity conflict.

## 5. Offline and fallback

Installed and verified local models remain available offline. Cached catalogue
may be browsed with a stale marker. Search/download clearly report network
unavailability. No API model is silently substituted for a selected local
model, and no preview is shown as installed.

## 6. Tests

- Desktop RED/GREEN: future contract tests for catalogue and preview transfer
  mapping; HF/Ollama/llama.cpp adapter conformance fixtures.
- Mobile RED/GREEN: same shared fixture decisions, multi-shard integrity,
  abandoned transfer recovery, and airplane-mode status.
- Semantic parity: identical catalogue identity; target-specific fit and
  transfer remain explicitly different.

## 7. Gate

- The owner catalogue/transfer contract gate is satisfied by the adapter-split
  decision recorded on 2026-08-04.
- Desktop human: preview labels target, mode, commands, and non-execution.
- Mobile physical: real transfer progresses, verifies, survives reload, and
  runs only on a compatible phone.
- Promotion requires one real upstream download on each supported execution
  target; mocks do not close the gate.

## 8. Rollback

Keep legacy Cookbook and mobile records through a read-adapter period. Rollback
stops new canonical writes but never removes verified model files or active
transfers. Provider adapter rollback is independent per upstream.

## Out of scope

Model comparison, benchmark groups, provider account setup, and scheduler/UI
redesign are not part of C3.
