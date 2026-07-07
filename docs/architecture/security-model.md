# Security Model

## Problem

Enterprise users need assurance that Kadmos will not leak credentials, call internal hosts by default, or execute arbitrary model output.

## Design

Security defaults:

- provider keys stay server-side;
- browser clients use control-plane APIs, not raw provider credentials;
- live validator failures fail closed;
- SSL verification is enabled by default;
- `KADMOS_INSECURE_SSL=1` is the only explicit local escape hatch;
- HTTP workers use `ExecutionPolicy`;
- localhost, metadata IP, and private networks are blocked by default.

## Example

```php
new ExecutionPolicy(
    blockedHosts: ['169.254.169.254', 'localhost', '127.0.0.1'],
    maxTimeoutMs: 10000,
    allowPrivateNetworks: false,
)
```

## Failure Mode

A request to `http://169.254.169.254/latest/meta-data` returns a failed worker result without network execution.

## Test Evidence

- `core/tests/Security/SslVerificationTest.php`
- `core/tests/Security/ExecutionPolicyTest.php`
