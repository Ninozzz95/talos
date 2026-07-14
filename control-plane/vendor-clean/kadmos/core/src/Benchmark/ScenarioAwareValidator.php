<?php

declare(strict_types=1);

namespace Kadmos\Benchmark;

use Kadmos\ValidationFault;
use Kadmos\ValidationResult;
use Kadmos\Validator\JmpValidatorInterface;

final class ScenarioAwareValidator implements JmpValidatorInterface
{
    /** @var array<string, true> */
    private array $knownNodes = [];

    public function __construct(private readonly BenchmarkScenario $scenario)
    {
    }

    public function validate(
        array $mutations,
        array $context,
        ?array $allowedNodeTypes = null,
        ?array $allowedBrowserOperations = null,
        bool $browserModeEnabled = false,
    ): ValidationResult
    {
        $spawnedInBatch = [];
        foreach ($mutations as $mutation) {
            if (is_array($mutation) && ($mutation['action'] ?? null) === 'SPAWN_NODE' && isset($mutation['node_id'])) {
                $spawnedInBatch[(string) $mutation['node_id']] = true;
            }
        }

        foreach ($mutations as $mutation) {
            if (!is_array($mutation) || ($mutation['action'] ?? null) !== 'MUTATE_PAYLOAD') {
                continue;
            }

            $nodeId = (string) ($mutation['node_id'] ?? '');
            if (!isset($this->knownNodes[$nodeId]) && !isset($spawnedInBatch[$nodeId]) && !isset($context[$nodeId])) {
                return new ValidationResult(false, [
                    new ValidationFault(
                        field: 'node_id',
                        expected: 'existing node id',
                        received: $nodeId,
                        message: "Cannot mutate unknown node {$nodeId}.",
                    ),
                ]);
            }

            $payload = $mutation['payload'] ?? [];
            if ($this->shouldRejectPayload($nodeId, is_array($payload) ? $payload : [])) {
                return new ValidationResult(false, [
                    new ValidationFault(
                        field: 'payload.url',
                        expected: 'valid URL string',
                        received: (string) ($payload['url'] ?? ''),
                        message: 'Injected benchmark validation fault.',
                    ),
                ]);
            }
        }

        foreach (array_keys($spawnedInBatch) as $nodeId) {
            $this->knownNodes[$nodeId] = true;
        }

        return new ValidationResult(true);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function shouldRejectPayload(string $nodeId, array $payload): bool
    {
        $error = $this->scenario->injectedError();
        if ($error === null || ($error['type'] ?? null) !== 'VALIDATION_FAULT' || ($error['node'] ?? null) !== $nodeId) {
            return false;
        }

        if (array_key_exists('url', $payload)) {
            return filter_var((string) $payload['url'], FILTER_VALIDATE_URL) === false;
        }

        return true;
    }
}
