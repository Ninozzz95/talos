# JSON Mutation Protocol

## Problem

Free-form model output is not a safe execution boundary. Kadmos needs an explicit protocol that can be validated before any worker runs.

## Design

JMP is the command language between LLM intent and AVM state:

- `SPAWN_NODE`: create a DAG node with type and dependencies.
- `MUTATE_PAYLOAD`: attach executable payload to an existing node.
- `YIELD_EXECUTION`: let the scheduler run currently available nodes.

The validator owns syntax and context checks. PHP core applies only accepted mutations.

## Example

```json
[
  {"action": "SPAWN_NODE", "node_id": "n1", "node_type": "HTTP_REQUEST"},
  {"action": "MUTATE_PAYLOAD", "node_id": "n1", "payload": {"url": "https://api.example.com"}},
  {"action": "YIELD_EXECUTION"}
]
```

## Failure Mode

Unknown node ids, unsupported node types, malformed payloads, and dependency errors return validation faults. Faults are explainable through `/api/faults/explain`.

## Test Evidence

- `validator/tests/*.test.ts`
- `core/tests/JmpValidatorClientTest.php`
- `core/tests/ValidatorBypassContractTest.php`
