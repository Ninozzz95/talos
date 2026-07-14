<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use JsonException;

final class ProceduralLoopGuard
{
    public const STATE_SCHEMA_VERSION = 'talos_procedural_loop_guard_v1';

    /** @var array<string, int> */
    private array $observations = [];

    /** @var array<string, int> */
    private array $retries = [];

    public function __construct(private readonly int $maxRetriesPerFingerprint = 2)
    {
        if ($maxRetriesPerFingerprint < 0 || $maxRetriesPerFingerprint > 10) {
            throw new InvalidArgumentException('Procedural retry limit is outside the supported range.');
        }
    }

    public function inspect(
        ToolCall $call,
        int $stateVersion,
        ?string $evidenceHash = null,
        bool $isRetry = false,
        ?string $logicalCallId = null,
        bool $isReplay = false,
    ): ProceduralLoopDecision
    {
        if ($logicalCallId !== null) {
            ToolContractGuard::nonEmptyString($logicalCallId, 'Procedural logical call ID', 256);
        }

        $fingerprint = $this->fingerprint($call, $stateVersion, $evidenceHash);
        if ($isReplay) {
            return new ProceduralLoopDecision(true, $fingerprint);
        }
        if ($isRetry) {
            $retryKey = $logicalCallId ?? $call->providerCallId;
            $attempt = ($this->retries[$retryKey] ?? 0) + 1;
            $this->retries[$retryKey] = $attempt;

            return $attempt <= $this->maxRetriesPerFingerprint
                ? new ProceduralLoopDecision(true, $fingerprint)
                : new ProceduralLoopDecision(false, $fingerprint, 'TALOS_TOOL_RETRY_BUDGET_EXHAUSTED');
        }

        $count = $this->observations[$fingerprint] ?? 0;
        if ($count > 0) {
            return new ProceduralLoopDecision(false, $fingerprint, 'TALOS_TOOL_LOOP_DETECTED');
        }
        $this->observations[$fingerprint] = 1;

        return new ProceduralLoopDecision(true, $fingerprint);
    }

    public function fingerprint(ToolCall $call, int $stateVersion, ?string $evidenceHash = null): string
    {
        ToolContractGuard::jsonSafeNonNegativeInteger($stateVersion, 'Procedural fingerprint state version');
        if ($evidenceHash !== null) {
            ToolContractGuard::sha256($evidenceHash, 'Procedural fingerprint evidence hash');
        }

        return 'sha256:'.hash('sha256', self::canonicalJson([
            'tool' => $call->name,
            'arguments' => $call->arguments,
            'state_version' => $stateVersion,
            'evidence_hash' => $evidenceHash,
        ]));
    }

    public function adopt(self $other): void
    {
        $this->observations = $other->observations;
        $this->retries = $other->retries;
    }

    /** @return array{schema_version: string, max_retries_per_fingerprint: int, observations: array<string, int>, retries: array<string, int>} */
    public function exportState(): array
    {
        $observations = $this->observations;
        $retries = $this->retries;
        ksort($observations, SORT_STRING);
        ksort($retries, SORT_STRING);

        return [
            'schema_version' => self::STATE_SCHEMA_VERSION,
            'max_retries_per_fingerprint' => $this->maxRetriesPerFingerprint,
            'observations' => $observations,
            'retries' => $retries,
        ];
    }

    /** @param array<string, mixed> $state */
    public static function fromState(array $state): self
    {
        ToolContractGuard::exactKeys(
            $state,
            ['schema_version', 'max_retries_per_fingerprint', 'observations', 'retries'],
            [],
            'Procedural loop guard state',
        );
        if ($state['schema_version'] !== self::STATE_SCHEMA_VERSION) {
            throw new InvalidArgumentException('Procedural loop guard state schema_version is unsupported.');
        }

        $maxRetries = ToolContractGuard::jsonSafeNonNegativeInteger(
            $state['max_retries_per_fingerprint'],
            'Procedural loop guard retry limit',
        );
        $observations = self::counterMap($state['observations'], 'Procedural loop guard observations', true);
        $retries = self::counterMap($state['retries'], 'Procedural loop guard retries', false);

        $guard = new self($maxRetries);
        $guard->observations = $observations;
        $guard->retries = $retries;

        return $guard;
    }

    public static function canonicalJson(mixed $value): string
    {
        try {
            return json_encode(self::canonicalValue($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Procedural canonical value is not JSON-compatible.', previous: $exception);
        }
    }

    private static function canonicalValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(self::canonicalValue(...), $value);
        }

        ksort($value, SORT_STRING);

        return array_map(self::canonicalValue(...), $value);
    }

    /** @return array<string, int> */
    private static function counterMap(mixed $value, string $label, bool $fingerprints): array
    {
        $map = ToolContractGuard::objectArray($value, $label);
        $validated = [];

        foreach ($map as $key => $count) {
            if (! is_string($key)) {
                throw new InvalidArgumentException(sprintf('%s keys must be strings.', $label));
            }
            if ($fingerprints) {
                ToolContractGuard::sha256($key, sprintf('%s key', $label));
            } else {
                ToolContractGuard::nonEmptyString($key, sprintf('%s key', $label), 256);
            }

            $count = ToolContractGuard::jsonSafeNonNegativeInteger($count, sprintf('%s count', $label));
            if ($count < 1) {
                throw new InvalidArgumentException(sprintf('%s counts must be positive integers.', $label));
            }
            $validated[$key] = $count;
        }

        ksort($validated, SORT_STRING);

        return $validated;
    }
}
