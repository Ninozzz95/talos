<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;

final readonly class TalosBrowserCommand
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
        public ?string $expectedEvidenceHash,
        public string $idempotencyKey,
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): self
    {
        $fields = ['schema_version', 'command_id', 'run_id', 'node_id', 'browser_session_id', 'operation', 'arguments', 'observation_request', 'risk', 'expected_evidence_hash', 'idempotency_key'];
        if (array_diff(array_keys($data), $fields) !== [] || array_diff($fields, array_keys($data)) !== []) {
            throw new InvalidArgumentException('Browser command contains unsupported fields.');
        }
        foreach ($fields as $field) {
            if (! array_key_exists($field, $data)) {
                throw new InvalidArgumentException("Missing browser command field: {$field}");
            }
        }

        $operation = $data['operation'];
        if (! is_string($operation) || ! in_array($operation, self::OPERATIONS, true)) {
            throw new InvalidArgumentException('Unknown or state-changing browser operation.');
        }
        if ($data['schema_version'] !== 'talos_browser_command_v1' || $data['risk'] !== 'read') {
            throw new InvalidArgumentException('Unsupported browser command schema or risk.');
        }
        if (! is_array($data['arguments']) || ! is_array($data['observation_request'])) {
            throw new InvalidArgumentException('Browser command arguments must be arrays.');
        }
        foreach (['command_id', 'run_id', 'browser_session_id'] as $field) {
            if (! is_string($data[$field]) || preg_match('/^[A-Za-z0-9_-]{1,128}$/', $data[$field]) !== 1) {
                throw new InvalidArgumentException("Browser command {$field} must be a non-empty string.");
            }
        }
        if (! is_string($data['node_id']) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $data['node_id']) !== 1) {
            throw new InvalidArgumentException('Browser command node_id must be a bounded non-empty string.');
        }
        if (! is_string($data['idempotency_key']) || preg_match('/^sha256:[a-f0-9]{64}$/', $data['idempotency_key']) !== 1) throw new InvalidArgumentException('Browser command idempotency key must be a SHA-256 key.');
        if ($operation === 'navigate' && (array_keys($data['arguments']) !== ['url'] || ! is_string($data['arguments']['url']) || trim($data['arguments']['url']) === '')) {
            throw new InvalidArgumentException('Navigate commands require exactly one URL argument.');
        }
        if (in_array($operation, ['snapshot', 'screenshot'], true) && $data['arguments'] !== []) {
            throw new InvalidArgumentException("{$operation} commands do not accept arguments.");
        }
        if ($operation === 'read') {
            if ($data['arguments'] === [] || array_diff(array_keys($data['arguments']), ['ref', 'query']) !== []) {
                throw new InvalidArgumentException('Read commands require ref or query arguments.');
            }
            foreach ($data['arguments'] as $argument) {
                if (! is_string($argument) || trim($argument) === '') throw new InvalidArgumentException('Read arguments must be non-empty strings.');
            }
        }
        if (! array_is_list($data['observation_request']) || array_filter($data['observation_request'], static fn (mixed $value): bool => ! is_string($value) || trim($value) === '') !== []) {
            throw new InvalidArgumentException('Browser observation request must be a string list.');
        }
        $expected = $data['expected_evidence_hash'];
        if ($operation === 'read' && (! is_string($expected) || preg_match('/^sha256:[a-f0-9]{64}$/', $expected) !== 1)) {
            throw new InvalidArgumentException('Read commands require the current SHA-256 evidence hash.');
        }
        if ($operation !== 'read' && $expected !== null) {
            throw new InvalidArgumentException('Only read commands may include an expected evidence hash.');
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
            $expected,
            (string) $data['idempotency_key'],
        );
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed> */
    public static function canonicalReadInput(
        string $runId,
        string $browserSessionId,
        string $operation,
        array $arguments,
        ?string $expectedEvidenceHash = null,
        string $nodeId = 'browser_direct',
    ): array {
        $intent = [
            'schema_version' => 'talos_browser_command_v1',
            'run_id' => $runId,
            'node_id' => $nodeId,
            'browser_session_id' => $browserSessionId,
            'operation' => $operation,
            'arguments' => $arguments,
            'observation_request' => [],
            'risk' => 'read',
            'expected_evidence_hash' => $expectedEvidenceHash,
        ];
        $encoded = json_encode($intent, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $fingerprint = hash('sha256', is_string($encoded) ? $encoded : serialize($intent));
        $input = [
            ...$intent,
            'command_id' => 'bc_'.substr($fingerprint, 0, 24),
            'idempotency_key' => 'sha256:'.$fingerprint,
        ];

        self::fromArray($input);

        return $input;
    }
}
