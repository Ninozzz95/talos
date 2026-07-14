<?php

declare(strict_types=1);

namespace Kadmos\Browser;

final readonly class BrowserReadCommand
{
    /** @var list<string> */
    public const OPERATIONS = ['navigate', 'snapshot', 'screenshot', 'read'];

    /** @param array<string, mixed> $data @param array<string, mixed> $arguments */
    private function __construct(
        public string $schemaVersion,
        public string $commandId,
        public string $runId,
        public string $nodeId,
        public string $browserSessionId,
        public string $operation,
        public array $arguments,
        public array $observationRequest,
        public string $idempotencyKey,
        public ?string $expectedEvidenceHash,
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): self
    {
        $required = ['schema_version', 'command_id', 'run_id', 'node_id', 'browser_session_id', 'operation', 'arguments', 'observation_request', 'risk', 'expected_evidence_hash', 'idempotency_key'];
        $actual = array_keys($data);
        sort($required);
        sort($actual);
        if ($actual !== $required) {
            throw new \InvalidArgumentException('Browser command must contain exactly the canonical fields.');
        }
        foreach ($required as $field) {
            if (! array_key_exists($field, $data)) {
                throw new \InvalidArgumentException("Browser command field is required: {$field}");
            }
        }

        $operation = $data['operation'];
        if (! is_string($operation) || ! in_array($operation, self::OPERATIONS, true)) {
            throw new \InvalidArgumentException('Browser command operation is not permitted.');
        }
        if ($data['schema_version'] !== 'talos_browser_command_v1' || $data['risk'] !== 'read') {
            throw new \InvalidArgumentException('Browser command schema or risk is not permitted.');
        }
        if (! is_array($data['arguments']) || ! is_array($data['observation_request'])) {
            throw new \InvalidArgumentException('Browser command arguments must be structured arrays.');
        }
        if (! self::matches('/^[A-Za-z0-9_-]{1,128}$/', $data['command_id'])
            || ! self::matches('/^[A-Za-z0-9_-]{1,64}$/', $data['node_id'])
            || ! self::isUuid($data['run_id'])
            || ! self::isUuid($data['browser_session_id'])
            || ! self::matches('/^sha256:[a-f0-9]{64}$/', $data['idempotency_key'])
        ) {
            throw new \InvalidArgumentException('Browser command contains a malformed ID or idempotency hash.');
        }
        if (! array_is_list($data['observation_request']) || count($data['observation_request']) > 3) {
            throw new \InvalidArgumentException('Browser command observation request must be a bounded list.');
        }
        foreach ($data['observation_request'] as $observation) {
            if (! is_string($observation) || ! in_array($observation, ['snapshot', 'screenshot', 'read'], true)) {
                throw new \InvalidArgumentException('Browser command observation request is not permitted.');
            }
        }
        if ($operation === 'navigate' && (! self::hasExactKeys($data['arguments'], ['url']) || ! self::isHttpUrl($data['arguments']['url']))) {
            throw new \InvalidArgumentException('Navigate commands require exactly one URL argument.');
        }
        if (in_array($operation, ['snapshot', 'screenshot'], true) && $data['arguments'] !== []) {
            throw new \InvalidArgumentException("{$operation} commands do not accept arguments.");
        }
        if ($operation === 'read') {
            $keys = array_keys($data['arguments']);
            if ($keys === [] || array_diff($keys, ['ref', 'query']) !== []) {
                throw new \InvalidArgumentException('Read commands require only ref and/or query arguments.');
            }
            foreach (['ref' => 128, 'query' => 512] as $field => $maxLength) {
                if (array_key_exists($field, $data['arguments'])
                    && (! is_string($data['arguments'][$field]) || $data['arguments'][$field] === '' || self::stringLength($data['arguments'][$field]) > $maxLength)
                ) {
                    throw new \InvalidArgumentException("Read command {$field} must be a bounded non-empty string.");
                }
            }
        }
        if ($operation === 'read') {
            if (! self::matches('/^sha256:[a-f0-9]{64}$/', $data['expected_evidence_hash'])) {
                throw new \InvalidArgumentException('Read commands require an exact SHA-256 source evidence hash.');
            }
        } elseif ($data['expected_evidence_hash'] !== null) {
            throw new \InvalidArgumentException('Only read commands may name source evidence.');
        }

        return new self(
            (string) $data['schema_version'],
            (string) $data['command_id'],
            (string) $data['run_id'],
            (string) $data['node_id'],
            (string) $data['browser_session_id'],
            $operation,
            $data['arguments'],
            $data['observation_request'],
            (string) $data['idempotency_key'],
            $data['expected_evidence_hash'],
        );
    }

    private static function matches(string $pattern, mixed $value): bool
    {
        return is_string($value) && preg_match($pattern, $value) === 1;
    }

    private static function isUuid(mixed $value): bool
    {
        return self::matches('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value);
    }

    /** @param array<string, mixed> $value @param list<string> $keys */
    private static function hasExactKeys(array $value, array $keys): bool
    {
        $actual = array_keys($value);
        sort($actual);
        sort($keys);

        return $actual === $keys;
    }

    private static function isHttpUrl(mixed $value): bool
    {
        if (! is_string($value) || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true) && is_string(parse_url($value, PHP_URL_HOST));
    }

    private static function stringLength(string $value): int
    {
        $length = preg_match_all('/./us', $value);

        return $length === false ? strlen($value) : $length;
    }
}
