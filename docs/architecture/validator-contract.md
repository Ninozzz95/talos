# Validator Contract

## Problem

If validation can be bypassed silently, AVM ON benchmarks do not prove the execution boundary.

## Design

Validator requests use:

```json
{
  "mutations": [],
  "context": {}
}
```

The validator is stateless. It returns accepted/rejected status and structured faults. Production AVM ON flows fail closed if the validator is unavailable. Mock validators are allowed only in test/demo paths and must be labeled.

## Example Fault

```json
{
  "field": "mutations[1].node_id",
  "expected": "node_id present in context",
  "received": "ghost_node_88",
  "message": "Node not found in context"
}
```

## Failure Mode

If `/validate` is unreachable, live commands exit with validator-unavailable semantics instead of falling back to mock validation.

## Test Evidence

- `core/tests/CliValidateFailClosedTest.php`
- `core/tests/CliStartFailClosedTest.php`
- `core/tests/ValidatorBypassContractTest.php`
