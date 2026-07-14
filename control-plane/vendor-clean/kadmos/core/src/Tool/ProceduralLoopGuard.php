<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use JsonException;

final class ProceduralLoopGuard
{
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

    public function inspect(ToolCall $call, int $stateVersion, ?string $evidenceHash = null, bool $isRetry = false): ProceduralLoopDecision
    {
        $fingerprint = $this->fingerprint($call, $stateVersion, $evidenceHash);
        if ($isRetry) {
            $retryKey = $call->providerCallId;
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
}
