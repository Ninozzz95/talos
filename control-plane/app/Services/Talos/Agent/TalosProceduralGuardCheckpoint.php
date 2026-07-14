<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;

final class TalosProceduralGuardCheckpoint
{
    private const SCHEMA_VERSION = 'talos_loop_guard_state_v2';

    private const LEGACY_SCHEMA_VERSION = 'talos_loop_guard_state_v1';

    /**
     * @param array<string, int> $repairAttempts
     * @param array<string, string> $providerCallLineage
     * @param array<string, true> $appliedRepairKeys
     */
    private function __construct(
        private ProceduralLoopGuard $guard,
        private array $repairAttempts = [],
        private array $providerCallLineage = [],
        private array $appliedRepairKeys = [],
    ) {}

    public static function fresh(): self
    {
        return new self(new ProceduralLoopGuard);
    }

    public static function fromEncoded(string $encoded): self
    {
        $state = TalosDagCheckpointCodec::decode($encoded);
        $version = self::assertEnvelope($state);

        $guardState = $state['guard'];
        if (! is_array($guardState)) {
            throw new InvalidArgumentException('Procedural guard checkpoint core state is invalid.');
        }

        return new self(
            ProceduralLoopGuard::fromState($guardState),
            self::decodeRepairAttempts($state['repair_attempts']),
            self::decodeLineage($state['provider_call_lineage']),
            $version === self::SCHEMA_VERSION ? self::decodeAppliedRepairs($state['applied_repairs']) : [],
        );
    }

    public function encode(): string
    {
        return TalosDagCheckpointCodec::encode([
            'schema_version' => self::SCHEMA_VERSION,
            'guard' => $this->guard->exportState(),
            'repair_attempts' => array_map(
                static fn (string $logicalCallId, int $attempt): array => [
                    'logical_call_id' => $logicalCallId,
                    'attempt' => $attempt,
                ],
                array_keys($this->sortedRepairAttempts()),
                array_values($this->sortedRepairAttempts()),
            ),
            'provider_call_lineage' => array_map(
                static fn (string $providerCallId, string $logicalCallId): array => [
                    'provider_call_id' => $providerCallId,
                    'logical_call_id' => $logicalCallId,
                ],
                array_keys($this->sortedLineage()),
                array_values($this->sortedLineage()),
            ),
            'applied_repairs' => array_keys($this->sortedAppliedRepairKeys()),
        ]);
    }

    public function guard(): ProceduralLoopGuard
    {
        return $this->guard;
    }

    /**
     * @param list<ToolCall> $calls
     * @param list<string> $repairSourceProviderCallIds
     */
    public function correlateCalls(array $calls, array $repairSourceProviderCallIds = []): void
    {
        self::assertCalls($calls);
        self::assertIdList($repairSourceProviderCallIds, 'Repair source provider call IDs');
        if ($repairSourceProviderCallIds !== [] && count($repairSourceProviderCallIds) !== count($calls)) {
            throw new TalosRepairLineageException;
        }
        if (count($repairSourceProviderCallIds) > 1) {
            $sourceIds = $repairSourceProviderCallIds;
            $replacementIds = array_map(static fn (ToolCall $call): string => $call->providerCallId, $calls);
            sort($sourceIds, SORT_STRING);
            sort($replacementIds, SORT_STRING);
            if ($sourceIds !== $replacementIds) {
                throw new TalosRepairLineageException;
            }
        }

        foreach ($calls as $index => $call) {
            $providerCallId = $call->providerCallId;
            $logicalCallId = $repairSourceProviderCallIds === [] || count($repairSourceProviderCallIds) > 1
                ? ($this->providerCallLineage[$providerCallId] ?? $providerCallId)
                : $this->logicalCallId($repairSourceProviderCallIds[$index]);
            $existing = $this->providerCallLineage[$providerCallId] ?? null;
            if (is_string($existing) && ! hash_equals($existing, $logicalCallId)) {
                throw new InvalidArgumentException('Provider call lineage conflicts with its durable logical call.');
            }
            $this->providerCallLineage[$providerCallId] = $logicalCallId;
            $this->repairAttempts[$logicalCallId] ??= 0;
        }
    }

    public function logicalCallId(string $providerCallId): string
    {
        $providerCallId = self::id($providerCallId, 'Provider call ID');

        return $this->providerCallLineage[$providerCallId] ?? $providerCallId;
    }

    public function repairAttempt(string $providerCallId): int
    {
        return $this->repairAttempts[$this->logicalCallId($providerCallId)] ?? 0;
    }

    public function incrementRepair(string $providerCallId): int
    {
        $logicalCallId = $this->logicalCallId($providerCallId);
        $attempt = ($this->repairAttempts[$logicalCallId] ?? 0) + 1;
        if ($attempt > 255) {
            throw new InvalidArgumentException('Tool repair attempt exceeds the durable supported range.');
        }
        $this->repairAttempts[$logicalCallId] = $attempt;

        return $attempt;
    }

    public function repairWasApplied(ToolResult $result): bool
    {
        return isset($this->appliedRepairKeys[$this->repairKey($result)]);
    }

    public function applyRepair(ToolResult $result): int
    {
        $key = $this->repairKey($result);
        if (isset($this->appliedRepairKeys[$key])) {
            return $this->repairAttempt($result->toolUseId);
        }

        $attempt = $this->incrementRepair($result->toolUseId);
        $this->appliedRepairKeys[$key] = true;

        return $attempt;
    }

    /** @param list<ToolCall> $calls @return array<string, string> */
    public function logicalCallIdsFor(array $calls): array
    {
        self::assertCalls($calls);

        return array_combine(
            array_map(static fn (ToolCall $call): string => $call->providerCallId, $calls),
            array_map(fn (ToolCall $call): string => $this->logicalCallId($call->providerCallId), $calls),
        ) ?: [];
    }

    /** @param list<ToolCall> $calls @return array<string, int> */
    public function repairAttemptsFor(array $calls): array
    {
        self::assertCalls($calls);

        return array_combine(
            array_map(static fn (ToolCall $call): string => $call->providerCallId, $calls),
            array_map(fn (ToolCall $call): int => $this->repairAttempt($call->providerCallId), $calls),
        ) ?: [];
    }

    /** @return list<string> */
    public function retryProviderCallIds(array $calls): array
    {
        self::assertCalls($calls);

        return array_values(array_map(
            static fn (ToolCall $call): string => $call->providerCallId,
            array_filter($calls, fn (ToolCall $call): bool => $this->repairAttempt($call->providerCallId) > 0),
        ));
    }

    public function maximumRepairAttempt(): int
    {
        return $this->repairAttempts === [] ? 0 : max($this->repairAttempts);
    }

    public function containsCompiledCall(ToolCall $call, string $fingerprint): bool
    {
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $fingerprint) !== 1) {
            throw new InvalidArgumentException('Procedural call fingerprint is invalid.');
        }

        $state = $this->guard->exportState();
        $attempt = $this->repairAttempt($call->providerCallId);
        if ($attempt > 0) {
            $logicalCallId = $this->logicalCallId($call->providerCallId);

            return (int) ($state['retries'][$logicalCallId] ?? 0) >= $attempt;
        }

        return (int) ($state['observations'][$fingerprint] ?? 0) > 0;
    }

    /** @param array<string, mixed> $state */
    private static function assertEnvelope(array $state): string
    {
        $version = $state['schema_version'] ?? null;
        $keys = array_keys($state);
        sort($keys, SORT_STRING);
        $expected = $version === self::LEGACY_SCHEMA_VERSION
            ? ['guard', 'provider_call_lineage', 'repair_attempts', 'schema_version']
            : ['applied_repairs', 'guard', 'provider_call_lineage', 'repair_attempts', 'schema_version'];
        if ($keys !== $expected || ! in_array($version, [self::SCHEMA_VERSION, self::LEGACY_SCHEMA_VERSION], true)) {
            throw new InvalidArgumentException('Procedural guard checkpoint envelope is invalid.');
        }

        return $version;
    }

    /** @return array<string, int> */
    private static function decodeRepairAttempts(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            throw new InvalidArgumentException('Procedural guard repair attempts must be a list.');
        }
        $attempts = [];
        foreach ($value as $entry) {
            if (! is_array($entry) || array_keys($entry) !== ['attempt', 'logical_call_id']) {
                throw new InvalidArgumentException('Procedural guard repair attempt entry is invalid.');
            }
            $logicalCallId = self::id($entry['logical_call_id'] ?? null, 'Logical call ID');
            $attempt = $entry['attempt'] ?? null;
            if (! is_int($attempt) || $attempt < 0 || $attempt > 255 || array_key_exists($logicalCallId, $attempts)) {
                throw new InvalidArgumentException('Procedural guard repair attempt value is invalid.');
            }
            $attempts[$logicalCallId] = $attempt;
        }

        return $attempts;
    }

    /** @return array<string, string> */
    private static function decodeLineage(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            throw new InvalidArgumentException('Procedural guard provider lineage must be a list.');
        }
        $lineage = [];
        foreach ($value as $entry) {
            if (! is_array($entry) || array_keys($entry) !== ['logical_call_id', 'provider_call_id']) {
                throw new InvalidArgumentException('Procedural guard provider lineage entry is invalid.');
            }
            $providerCallId = self::id($entry['provider_call_id'] ?? null, 'Provider call ID');
            $logicalCallId = self::id($entry['logical_call_id'] ?? null, 'Logical call ID');
            if (array_key_exists($providerCallId, $lineage)) {
                throw new InvalidArgumentException('Procedural guard provider lineage contains a duplicate ID.');
            }
            $lineage[$providerCallId] = $logicalCallId;
        }

        return $lineage;
    }

    /** @return array<string, true> */
    private static function decodeAppliedRepairs(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            throw new InvalidArgumentException('Procedural applied repair keys must be a list.');
        }
        $keys = [];
        foreach ($value as $key) {
            if (! is_string($key)
                || preg_match('/^sha256:[a-f0-9]{64}$/', $key) !== 1
                || isset($keys[$key])) {
                throw new InvalidArgumentException('Procedural applied repair key is invalid.');
            }
            $keys[$key] = true;
        }

        return $keys;
    }

    /** @param list<ToolCall> $calls */
    private static function assertCalls(array $calls): void
    {
        if (! array_is_list($calls)) {
            throw new InvalidArgumentException('Procedural provider calls must be a list.');
        }
        $ids = [];
        foreach ($calls as $call) {
            if (! $call instanceof ToolCall || isset($ids[$call->providerCallId])) {
                throw new InvalidArgumentException('Procedural provider calls contain an invalid or duplicate call.');
            }
            $ids[$call->providerCallId] = true;
        }
    }

    /** @param list<string> $ids */
    private static function assertIdList(array $ids, string $label): void
    {
        if (! array_is_list($ids)) {
            throw new InvalidArgumentException($label.' must be a list.');
        }
        $seen = [];
        foreach ($ids as $id) {
            $id = self::id($id, $label.' entry');
            if (isset($seen[$id])) {
                throw new InvalidArgumentException($label.' must be unique.');
            }
            $seen[$id] = true;
        }
    }

    private static function id(mixed $value, string $label): string
    {
        if (! is_string($value) || trim($value) === '' || strlen($value) > 256) {
            throw new InvalidArgumentException($label.' is invalid.');
        }

        return $value;
    }

    private function repairKey(ToolResult $result): string
    {
        $code = $result->structuredContent['code'] ?? null;
        if (! $result->isError || ! is_string($code) || trim($code) === '' || strlen($code) > 128) {
            throw new InvalidArgumentException('Applied repair must be a typed canonical tool error.');
        }

        return 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson([
            'provider_call_id' => $result->toolUseId,
            'logical_call_id' => $this->logicalCallId($result->toolUseId),
            'code' => $code,
        ]));
    }

    /** @return array<string, int> */
    private function sortedRepairAttempts(): array
    {
        $attempts = $this->repairAttempts;
        ksort($attempts, SORT_STRING);

        return $attempts;
    }

    /** @return array<string, string> */
    private function sortedLineage(): array
    {
        $lineage = $this->providerCallLineage;
        ksort($lineage, SORT_STRING);

        return $lineage;
    }

    /** @return array<string, true> */
    private function sortedAppliedRepairKeys(): array
    {
        $keys = $this->appliedRepairKeys;
        ksort($keys, SORT_STRING);

        return $keys;
    }
}
