# TALOS Evolution Protocol v1

This directory defines the language-neutral contracts between the future native
Evolution Supervisor, the evolvable TALOS runtime, and generated extensions.

**E0-2 is contract-only.** No file here grants authority or activates a runtime.
The Supervisor implementation begins in later slices.

## Protocol layers

```
semantic messages
      |
      v
Protobuf Envelope
      |
4-byte little-endian unsigned payload length
      |
      v
byte-stream transport
(v1 production target: private Windows Named Pipe)
```

Protocol semantics MUST NOT depend on Named Pipe message boundaries.

## Framing

A v1 frame is:

1. exactly 4 bytes: unsigned little-endian payload length;
2. exactly that many bytes: one binary Protobuf `Envelope`.

Rules:

- zero-length frames are invalid;
- control frames larger than **1 MiB** are invalid;
- the receiver checks the length before allocating the payload;
- EOF before the declared payload is complete is a protocol error;
- large artifacts are transferred by bounded chunks or content-addressed references,
  not by increasing the control-frame ceiling.

The exact chunk-store implementation is intentionally deferred.

## Version negotiation

The connection begins with `ClientHello`. Before the handshake completes,
only handshake/rejection messages are valid.

A protocol version is `major.minor`:

- a major version changes incompatible semantics;
- minor changes are additive and must preserve v1 wire semantics;
- the Supervisor selects one version advertised by both peers;
- unsupported major versions fail closed;
- a feature that changes behavior beyond the selected minor version requires
  explicit feature negotiation.

The negotiated connection ID is not a capability and is not a secret.

## Identity separation

The protocol deliberately keeps these concepts distinct:

- **transport peer / connection ID** — which process/session is connected;
- **message/request ID** — correlation of one operation;
- **domain IDs** — runtime, candidate, extension, feature contract, etc.;
- **trace context** — observability only;
- **capability lease ID** — future authority token, defined by later slices.

No trace or request ID grants authority.

## Windows transport requirements for E1

The future production Named Pipe implementation MUST use:

- an explicit least-privilege security descriptor/DACL;
- `PIPE_REJECT_REMOTE_CLIENTS`;
- a non-guessable per-launch pipe name;
- peer-process binding (including client PID verification where applicable);
- byte-stream mode with the framing above.

The default Windows Named Pipe ACL is not acceptable for the Supervisor boundary.

## Protobuf compatibility policy

The binary Protobuf schema is the internal wire representation.

Rules:

1. Never reuse a field number.
2. When a field is removed, reserve its number and name.
3. Minor versions add fields/messages/enum choices; they do not silently change
   the meaning of existing fields.
4. Existing field types/cardinality are not changed incompatibly.
5. Unknown optional fields are tolerated where Protobuf semantics permit.
6. Unknown required **features** or unsupported major protocol versions fail closed.
7. JSON conversion is not part of the authority-bound wire contract.

A later toolchain slice may introduce automated Buf/protoc compatibility checks.

## Cryptographic hashing rule

**Serialized Protobuf bytes are never the canonical cryptographic identity of a
TALOS durable object.**

Official Protobuf guidance explicitly states that deterministic serialization is
not canonical across schema/library/build changes.

Therefore:

- artifact digests hash the actual artifact bytes using an explicitly named
  algorithm;
- durable signed attestation canonicalization is a separate E3 design concern;
- no code may implement `sha256(proto.serialize(message))` as a lineage or
  authority identity merely because serialization is deterministic.

## Error model

Machine automation uses stable enum/error codes. Human-readable messages are
diagnostic text and may evolve.

Invalid message ordering, malformed mandatory content, unsupported versions,
oversized frames, identity mismatch and artifact/hash mismatch are fail-closed.

## Schema directories

- `proto/` — Supervisor/runtime control wire.
- `schemas/` — durable artifact/manifest contracts.
- `wit/` — generated-extension host ABI.
- `fixtures/` — positive/negative contract fixtures.

The JSON schemas are durable human/tool-readable contracts. They are not the
Named Pipe wire encoding.

## Extension WIT

The first extension world exposes only TALOS-mediated interfaces. It does not
preopen a host filesystem, sockets, process execution or environment secrets.

Network/process capabilities, if introduced later, require their own explicit
WIT interfaces and Supervisor capability policy.

## Compatibility changes

Any change to these contracts must state whether it is:

- additive and wire-compatible;
- a new negotiated feature;
- a new major protocol version;
- a durable-schema migration.

A silent semantic change is never considered compatible.
