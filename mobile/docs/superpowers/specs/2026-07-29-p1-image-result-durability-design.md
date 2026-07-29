# Design - durable image tool results

Date: 2026-07-29  
Status: ready for RED

## Canonical flow

```text
provider image bytes
  -> generate_image
  -> Vault ingestion + verified file + active grant
  -> tool result
       |-> typed image part -> same agent loop -> vision model
       `-> binding ids -> final completion -> assistant message transaction
  -> existing message attachment projection
  -> existing image renderer
  -> reload-safe chat image
```

## Contracts

- the existing `saveGeneratedBinary` helper remains Library-only by default
  and continues revoking its unused grant; its explicit `forMessage: true`
  overload retains the pre-minted grant and returns a fresh message binding.
- `TalosToolResult.messageAttachments` carries only canonical binding inputs.
- the agent loop accumulates successful result attachments in tool-call order
  and exposes them on its outcome.
- `ChatCompletionResult.attachments` is persisted atomically with the final
  assistant message.
- controller tool execution forwards both `images` and
  `messageAttachments`; no array-position parsing is introduced.
- history construction resolves attachment parts only for user turns.

## Failure behavior

- if image generation fails, no file, grant, or binding is produced;
- if Vault ingestion fails, no durable attachment is advertised;
- if a tool throws, other parallel outcomes remain usable and no fabricated
  binding is added;
- if final assistant persistence fails, the existing storage failure path
  remains authoritative; the Vault item remains discoverable in the Library;
- duplicate binding ids are de-duplicated defensively at the loop boundary.

## Compatibility

- provider wire formats and gateway endpoints do not change;
- existing uploaded user attachments keep their current model-input behavior;
- generated documents that are Library-only remain Library-only;
- no database schema or native Android contract changes;
- the initial bundle budget must remain at or below 560,000 bytes.

## Human-visible proof

After a successful OpenRouter/Gemini image tool round, the model receives the
image in the immediate follow-up call, the final assistant row contains the
image attachment, the same image renders after reopening the chat, and a later
plain text turn does not silently resend that assistant image to the provider.
