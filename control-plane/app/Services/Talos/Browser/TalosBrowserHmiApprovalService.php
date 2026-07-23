<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserHmiApproval;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class TalosBrowserHmiApprovalService
{
    private const TTL_SECONDS = 60;

    private const EXECUTION_LEASE_SECONDS = 30;

    private const POINTER_SCHEMA = 'talos_browser_hmi_pointer_v2';

    private const REF_SCHEMA = 'talos_browser_hmi_ref_v2';

    /** @param array<string, mixed> $attributes */
    public function issue(array $attributes): TalosBrowserHmiApproval
    {
        $normalized = $this->normalizeAttributes($attributes);
        $payload = $normalized['payload'];
        $payloadHash = 'sha256:'.hash('sha256', $this->canonicalJson($payload));
        $requestHash = 'sha256:'.hash('sha256', $this->canonicalJson($attributes));

        if (isset($attributes['payload_hash']) && $attributes['payload_hash'] !== $payloadHash) {
            throw new InvalidArgumentException('HMI approval payload hash does not match the versioned payload.');
        }
        if (isset($attributes['request_hash']) && $attributes['request_hash'] !== $requestHash) {
            throw new InvalidArgumentException('HMI approval request hash does not match the exact request.');
        }

        $candidate = TalosBrowserHmiApproval::query()->firstOrCreate(
            [
                'browser_session_id' => $normalized['browser_session_id'],
                'command_id' => $normalized['command_id'],
            ],
            [
                'id' => (string) Str::uuid(),
                ...$normalized,
                'status' => 'pending',
                'payload_hash' => $payloadHash,
                'request_hash' => $requestHash,
                'expires_at' => now()->addSeconds(self::TTL_SECONDS),
            ],
        );
        $wasRecentlyCreated = $candidate->wasRecentlyCreated;

        return DB::transaction(function () use ($normalized, $payloadHash, $requestHash, $candidate, $wasRecentlyCreated): TalosBrowserHmiApproval {
            $existing = TalosBrowserHmiApproval::query()
                ->where('browser_session_id', $normalized['browser_session_id'])
                ->where('command_id', $normalized['command_id'])
                ->lockForUpdate()
                ->first();
            if (! $existing instanceof TalosBrowserHmiApproval
                || (int) $existing->user_id !== (int) $normalized['user_id']
                || ! hash_equals((string) $existing->payload_hash, $payloadHash)
                || ! hash_equals((string) $existing->request_hash, $requestHash)) {
                throw new InvalidArgumentException('HMI command id is already bound to a different request.');
            }

            $this->expireIfNeeded($existing);
            $fresh = $existing->fresh();
            $fresh->wasRecentlyCreated = $wasRecentlyCreated && $candidate->is($existing);

            return $fresh;
        }, 3);
    }

    /** @param array<string, mixed> $binding */
    public function approve(string $approvalId, int $ownerId, array $binding): TalosBrowserHmiApproval
    {
        $this->assertBindingContract($binding);

        return DB::transaction(function () use ($approvalId, $ownerId, $binding): TalosBrowserHmiApproval {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null || (int) $approval->user_id !== $ownerId) {
                throw new InvalidArgumentException('HMI approval is not owned by this user.');
            }
            $this->expireIfNeeded($approval);
            if ($approval->status !== 'pending' || ! $this->matchesBinding($approval, $binding)) {
                throw new InvalidArgumentException('HMI approval is not eligible for this exact approval.');
            }

            $approval->forceFill([
                'status' => 'approved',
                'approved_at' => now(),
            ])->save();

            return $approval->fresh();
        }, 3);
    }

    /** @param array<string, mixed> $binding */
    public function reject(string $approvalId, int $ownerId, array $binding): TalosBrowserHmiApproval
    {
        $this->assertBindingContract($binding);

        return DB::transaction(function () use ($approvalId, $ownerId, $binding): TalosBrowserHmiApproval {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null || (int) $approval->user_id !== $ownerId) {
                throw new InvalidArgumentException('HMI approval is not owned by this user.');
            }
            $this->expireIfNeeded($approval);
            if ($approval->status !== 'pending' || ! $this->matchesBinding($approval, $binding)) {
                throw new InvalidArgumentException('HMI approval is not eligible for this exact rejection.');
            }

            $approval->forceFill(['status' => 'rejected', 'rejected_at' => now()])->save();

            return $approval->fresh();
        }, 3);
    }

    /** @param array<string, mixed> $binding */
    public function claimForExecution(
        string $approvalId,
        int $ownerId,
        array $binding,
        ?array $executionPayload = null,
    ): string|false {
        $this->assertBindingContract($binding);

        return DB::transaction(function () use ($approvalId, $ownerId, $binding, $executionPayload): string|false {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null || (int) $approval->user_id !== $ownerId) {
                return false;
            }
            if (in_array($approval->status, ['pending', 'approved'], true) && $approval->expires_at?->isPast()) {
                $approval->forceFill(['status' => 'expired'])->save();

                return false;
            }
            if ($approval->status !== 'approved' || ! $this->matchesBinding($approval, $binding)) {
                return false;
            }
            $payload = $this->normalizeExecutionPayload($approval, $executionPayload ?? $approval->payload);
            $now = now();
            $leaseToken = (string) Str::uuid();

            if (! $approval->forceFill([
                'status' => 'executing',
                'execution_started_at' => $now,
                'execution_payload' => $payload,
                'execution_lease_token' => $leaseToken,
                'execution_lease_expires_at' => $now->copy()->addSeconds(self::EXECUTION_LEASE_SECONDS),
                'execution_attempts' => ((int) $approval->execution_attempts) + 1,
            ])->save()) {
                return false;
            }

            return $leaseToken;
        }, 3);
    }

    /** @param array<string, mixed> $binding */
    public function reclaimForExecution(string $approvalId, int $ownerId, array $binding): string|false
    {
        $this->assertBindingContract($binding);

        return DB::transaction(function () use ($approvalId, $ownerId, $binding): string|false {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if (! $approval instanceof TalosBrowserHmiApproval
                || (int) $approval->user_id !== $ownerId
                || $approval->status !== 'executing'
                || ! $this->matchesBinding($approval, $binding)
                || ! $this->executionLeaseExpired($approval)) {
                return false;
            }
            $payload = $this->normalizeExecutionPayload($approval, $approval->execution_payload);
            $now = now();
            $leaseToken = (string) Str::uuid();

            if (! $approval->forceFill([
                'execution_started_at' => $now,
                'execution_payload' => $payload,
                'execution_lease_token' => $leaseToken,
                'execution_lease_expires_at' => $now->copy()->addSeconds(self::EXECUTION_LEASE_SECONDS),
                'execution_attempts' => ((int) $approval->execution_attempts) + 1,
            ])->save()) {
                return false;
            }

            return $leaseToken;
        }, 3);
    }

    public function executionLeaseExpired(TalosBrowserHmiApproval $approval): bool
    {
        if ($approval->status !== 'executing') {
            return false;
        }
        if ($approval->execution_lease_expires_at !== null) {
            return $approval->execution_lease_expires_at->isPast();
        }

        return $approval->execution_started_at === null
            || $approval->execution_started_at->lte(now()->subSeconds(self::EXECUTION_LEASE_SECONDS));
    }

    public function renewExecutionLease(
        string $approvalId,
        int $ownerId,
        string $commandId,
        string $executionLeaseToken,
    ): bool {
        return DB::transaction(function () use ($approvalId, $ownerId, $commandId, $executionLeaseToken): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if (! $approval instanceof TalosBrowserHmiApproval
                || (int) $approval->user_id !== $ownerId
                || $approval->status !== 'executing'
                || ! hash_equals((string) $approval->command_id, $commandId)
                || ! $this->matchesExecutionLease($approval, $executionLeaseToken)) {
                return false;
            }

            return $approval->forceFill([
                'execution_lease_expires_at' => now()->addSeconds(self::EXECUTION_LEASE_SECONDS),
            ])->save();
        }, 3);
    }

    /** @param array<string, mixed> $binding @param array<string, mixed> $result */
    public function completeExecution(
        string $approvalId,
        int $ownerId,
        array $binding,
        array $result,
        string $executionLeaseToken,
    ): bool {
        $this->assertBindingContract($binding);
        if ($result === [] || array_is_list($result)) {
            throw new InvalidArgumentException('HMI execution result must be a non-empty object.');
        }

        return DB::transaction(function () use ($approvalId, $ownerId, $binding, $result, $executionLeaseToken): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null
                || (int) $approval->user_id !== $ownerId
                || $approval->status !== 'executing'
                || ! $this->matchesExecutionLease($approval, $executionLeaseToken)
                || ! $this->matchesBinding($approval, $binding)
                || ! hash_equals((string) $approval->command_id, (string) data_get($result, 'data.interaction.command_id', ''))) {
                return false;
            }

            return $approval->forceFill([
                'status' => 'consumed',
                'consumed_at' => now(),
                'result_payload' => $result,
                'execution_lease_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();
        }, 3);
    }

    public function abortExecution(string $approvalId, int $ownerId, string $commandId, string $executionLeaseToken): bool
    {
        return DB::transaction(function () use ($approvalId, $ownerId, $commandId, $executionLeaseToken): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null
                || (int) $approval->user_id !== $ownerId
                || $approval->status !== 'executing'
                || ! $this->matchesExecutionLease($approval, $executionLeaseToken)
                || ! hash_equals((string) $approval->command_id, $commandId)) {
                return false;
            }

            return $approval->forceFill([
                'status' => 'invalidated',
                'rejected_at' => now(),
                'execution_lease_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();
        }, 3);
    }

    public function releaseOrdinaryPreDispatchFailure(
        string $approvalId,
        int $ownerId,
        string $commandId,
        string $executionLeaseToken,
    ): bool {
        return DB::transaction(function () use ($approvalId, $ownerId, $commandId, $executionLeaseToken): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            $payload = is_array($approval?->execution_payload) ? $approval->execution_payload : [];
            if (! $approval instanceof TalosBrowserHmiApproval
                || (int) $approval->user_id !== $ownerId
                || $approval->status !== 'executing'
                || ! $this->matchesExecutionLease($approval, $executionLeaseToken)
                || ! hash_equals((string) $approval->command_id, $commandId)
                || ($payload['effect_classification'] ?? null) !== 'ordinary'
                || ($payload['sensitive_effect_authorized'] ?? null) !== false) {
                return false;
            }

            return $approval->forceFill([
                'status' => 'pending',
                'approved_at' => null,
                'execution_started_at' => null,
                'execution_payload' => null,
                'execution_lease_token' => null,
                'execution_lease_expires_at' => null,
                'expires_at' => now()->addSeconds(self::TTL_SECONDS),
            ])->save();
        }, 3);
    }

    public function findByCommandId(int $ownerId, string $browserSessionId, string $commandId): ?TalosBrowserHmiApproval
    {
        return TalosBrowserHmiApproval::query()
            ->where('user_id', $ownerId)
            ->where('browser_session_id', $browserSessionId)
            ->where('command_id', $commandId)
            ->first();
    }

    /** @param array<string, mixed> $binding */
    public function invalidate(string $approvalId, int $ownerId, array $binding): bool
    {
        $this->assertBindingContract($binding);

        return DB::transaction(function () use ($approvalId, $ownerId, $binding): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null
                || (int) $approval->user_id !== $ownerId
                || ! in_array($approval->status, ['pending', 'approved'], true)
                || ! $this->matchesBinding($approval, $binding)) {
                return false;
            }

            return $approval->forceFill([
                'status' => 'invalidated',
                'rejected_at' => now(),
            ])->save();
        }, 3);
    }

    public function expire(string $approvalId, int $ownerId): bool
    {
        return DB::transaction(function () use ($approvalId, $ownerId): bool {
            $approval = TalosBrowserHmiApproval::query()->lockForUpdate()->find($approvalId);
            if ($approval === null
                || (int) $approval->user_id !== $ownerId
                || ! in_array($approval->status, ['pending', 'approved'], true)
                || ! $approval->expires_at?->isPast()) {
                return false;
            }

            return $approval->forceFill(['status' => 'expired'])->save();
        }, 3);
    }

    public function canonicalJson(mixed $value): string
    {
        return json_encode($this->canonicalValue($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private function normalizeAttributes(array $attributes): array
    {
        $ownerId = $attributes['owner_id'] ?? $attributes['user_id'] ?? null;
        $payload = $attributes['payload'] ?? null;
        $this->assertInteger($ownerId, 'owner_id');
        $payloadVersion = is_array($payload) ? ($payload['schema_version'] ?? null) : null;
        if (! is_array($payload)
            || $payload === []
            || array_is_list($payload)
            || ! in_array($payloadVersion, [self::POINTER_SCHEMA, self::REF_SCHEMA], true)) {
            throw new InvalidArgumentException('HMI approval payload must be a versioned object.');
        }
        $x = $attributes['normalized_x'] ?? null;
        $y = $attributes['normalized_y'] ?? null;
        if (! is_int($x) && ! is_float($x) || ! is_finite((float) $x) || (float) $x < 0 || (float) $x > 1) {
            throw new InvalidArgumentException('HMI normalized_x must be finite and within [0, 1].');
        }
        if (! is_int($y) && ! is_float($y) || ! is_finite((float) $y) || (float) $y < 0 || (float) $y > 1) {
            throw new InvalidArgumentException('HMI normalized_y must be finite and within [0, 1].');
        }
        if (($attributes['button'] ?? null) !== 'left' || ! in_array($attributes['click_count'] ?? null, [1, 2], true)) {
            throw new InvalidArgumentException('HMI pointer button or click count is unsupported.');
        }
        foreach (['browser_session_id', 'artifact_id', 'artifact_sha256', 'target_fingerprint', 'category'] as $field) {
            if (! is_string($attributes[$field] ?? null) || trim($attributes[$field]) === '') {
                throw new InvalidArgumentException("HMI approval {$field} is required.");
            }
        }
        foreach (['artifact_sha256', 'target_fingerprint'] as $field) {
            if (preg_match('/^sha256:[a-f0-9]{64}$/', (string) $attributes[$field]) !== 1) {
                throw new InvalidArgumentException("HMI approval {$field} must be a sha256 digest.");
            }
        }

        $stateVersion = $this->nonNegativeInteger($attributes['state_version'] ?? null, 'state_version');
        $payloadStateVersion = $this->nonNegativeInteger($payload['state_version'] ?? null, 'payload.state_version');
        $payloadFrameHash = $payload['expected_frame_sha256'] ?? null;
        $payloadFingerprint = $payload['expected_fingerprint'] ?? null;
        $commandId = $payload['command_id'] ?? null;
        $interactionId = $payload['interaction_id'] ?? null;
        if (! is_string($interactionId) || ! Str::isUuid($interactionId)) {
            throw new InvalidArgumentException('HMI worker interaction id must be a UUID.');
        }
        if (! is_string($commandId) || preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/', $commandId) !== 1) {
            throw new InvalidArgumentException('HMI worker command id is invalid.');
        }
        if (! in_array($payload['effect_classification'] ?? null, ['ordinary', 'sensitive'], true)
            || ($payload['sensitive_effect_authorized'] ?? null) !== false) {
            throw new InvalidArgumentException('HMI approval payload must be pre-authorization bound.');
        }
        if (! is_string($payloadFrameHash)
            || preg_match('/^sha256:[a-f0-9]{64}$/', $payloadFrameHash) !== 1
            || ! hash_equals((string) $attributes['artifact_sha256'], $payloadFrameHash)) {
            throw new InvalidArgumentException('HMI worker frame hash must exactly match the bound screenshot artifact.');
        }
        if (! is_string($payloadFingerprint)
            || preg_match('/^sha256:[a-f0-9]{64}$/', $payloadFingerprint) !== 1
            || ! hash_equals((string) $attributes['target_fingerprint'], $payloadFingerprint)) {
            throw new InvalidArgumentException('HMI worker target fingerprint must exactly match the approved target.');
        }
        if ($payloadStateVersion !== $stateVersion
            || ($payload['button'] ?? null) !== 'left'
            || ($payload['click_count'] ?? null) !== (int) $attributes['click_count']) {
            throw new InvalidArgumentException('HMI worker payload does not match the approved executable fields.');
        }
        if ($payloadVersion === self::POINTER_SCHEMA
            && (round($this->normalizedCoordinate($payload['normalized_x'] ?? null, 'payload.normalized_x'), 6) !== round((float) $x, 6)
                || round($this->normalizedCoordinate($payload['normalized_y'] ?? null, 'payload.normalized_y'), 6) !== round((float) $y, 6))) {
            throw new InvalidArgumentException('HMI worker pointer payload does not match the approved executable fields.');
        }
        if ($payloadVersion === self::REF_SCHEMA) {
            $expectedKeys = [
                'schema_version', 'interaction_id', 'command_id', 'state_version', 'expected_frame_sha256',
                'snapshot_id', 'ref', 'button', 'click_count', 'expected_fingerprint',
                'effect_classification', 'sensitive_effect_authorized',
            ];
            $actualKeys = array_keys($payload);
            sort($actualKeys);
            sort($expectedKeys);
            if ($actualKeys !== $expectedKeys
                || ! is_string($payload['snapshot_id'] ?? null)
                || preg_match('/^hmi_ref_[a-f0-9]{64}$/D', $payload['snapshot_id']) !== 1
                || ! is_string($payload['ref'] ?? null)
                || preg_match('/^e[1-9][0-9]{0,9}$/D', $payload['ref']) !== 1) {
                throw new InvalidArgumentException('HMI worker ref payload does not match the approved semantic target.');
            }
        }

        return [
            'user_id' => (int) $ownerId,
            'browser_session_id' => (string) $attributes['browser_session_id'],
            'command_id' => $commandId,
            'interaction_id' => $interactionId,
            'artifact_id' => (string) $attributes['artifact_id'],
            'artifact_sha256' => (string) $attributes['artifact_sha256'],
            'state_version' => $stateVersion,
            'normalized_x' => round((float) $x, 6),
            'normalized_y' => round((float) $y, 6),
            'button' => 'left',
            'click_count' => (int) $attributes['click_count'],
            'target_fingerprint' => (string) $attributes['target_fingerprint'],
            'category' => substr(trim((string) $attributes['category']), 0, 64),
            'payload_version' => $payloadVersion,
            'payload' => $payload,
        ];
    }

    /** @param array<string, mixed> $binding */
    private function matchesBinding(TalosBrowserHmiApproval $approval, array $binding): bool
    {
        if (array_key_exists('request_hash', $binding)) {
            return hash_equals((string) $approval->request_hash, (string) $binding['request_hash']);
        }
        $fields = ['browser_session_id', 'artifact_id', 'artifact_sha256', 'state_version', 'normalized_x', 'normalized_y', 'button', 'click_count', 'target_fingerprint', 'category'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $binding) && (string) $approval->{$field} !== (string) $binding[$field]) {
                return false;
            }
        }
        if (array_key_exists('payload', $binding)) {
            $hash = 'sha256:'.hash('sha256', $this->canonicalJson($binding['payload']));
            if (! hash_equals((string) $approval->payload_hash, $hash)) {
                return false;
            }
        }
        if (array_key_exists('payload_hash', $binding) && ! hash_equals((string) $approval->payload_hash, (string) $binding['payload_hash'])) {
            return false;
        }

        return true;
    }

    private function matchesExecutionLease(TalosBrowserHmiApproval $approval, string $executionLeaseToken): bool
    {
        return Str::isUuid($executionLeaseToken)
            && is_string($approval->execution_lease_token)
            && hash_equals((string) $approval->execution_lease_token, $executionLeaseToken)
            && $approval->execution_lease_expires_at !== null
            && $approval->execution_lease_expires_at->isFuture();
    }

    /** @return array<string, mixed> */
    private function normalizeExecutionPayload(TalosBrowserHmiApproval $approval, mixed $payload): array
    {
        if (! is_array($payload) || $payload === [] || array_is_list($payload)) {
            throw new InvalidArgumentException('HMI execution payload must be a non-empty object.');
        }
        $approvedPayload = is_array($approval->payload) && ! array_is_list($approval->payload)
            ? $approval->payload
            : null;
        if (! is_array($approvedPayload)) {
            throw new InvalidArgumentException('HMI approved payload is unavailable.');
        }
        $classification = $approvedPayload['effect_classification'] ?? null;
        $expectedAuthorization = $classification === 'sensitive';
        $expected = [...$approvedPayload, 'sensitive_effect_authorized' => $expectedAuthorization];
        if (($payload['sensitive_effect_authorized'] ?? null) !== $expectedAuthorization
            || ! hash_equals($this->canonicalJson($expected), $this->canonicalJson($payload))) {
            throw new InvalidArgumentException('HMI execution payload does not match the exact authorized command.');
        }

        return $payload;
    }

    /** @param array<string, mixed> $binding */
    private function assertBindingContract(array $binding): void
    {
        if ($binding === []) {
            throw new InvalidArgumentException('HMI approval requires an exact binding; an empty binding is forbidden.');
        }
        if (array_key_exists('request_hash', $binding)) {
            if (count($binding) !== 1 || ! is_string($binding['request_hash']) || preg_match('/^sha256:[a-f0-9]{64}$/', $binding['request_hash']) !== 1) {
                throw new InvalidArgumentException('HMI approval request_hash must be the sole exact binding.');
            }

            return;
        }

        foreach (['browser_session_id', 'artifact_id', 'artifact_sha256', 'state_version', 'normalized_x', 'normalized_y', 'button', 'click_count', 'target_fingerprint', 'category'] as $field) {
            if (! array_key_exists($field, $binding)) {
                throw new InvalidArgumentException("HMI approval binding is missing {$field}.");
            }
        }
        if (! array_key_exists('payload', $binding) && ! array_key_exists('payload_hash', $binding)) {
            throw new InvalidArgumentException('HMI approval binding requires payload or payload_hash.');
        }
        if (array_key_exists('payload', $binding) && ! is_array($binding['payload'])) {
            throw new InvalidArgumentException('HMI approval binding payload must be an object.');
        }
        if (array_key_exists('payload_hash', $binding)
            && (! is_string($binding['payload_hash']) || preg_match('/^sha256:[a-f0-9]{64}$/', $binding['payload_hash']) !== 1)) {
            throw new InvalidArgumentException('HMI approval binding payload_hash must be a sha256 digest.');
        }
    }

    private function expireIfNeeded(TalosBrowserHmiApproval $approval): void
    {
        if (in_array($approval->status, ['pending', 'approved'], true) && $approval->expires_at?->isPast()) {
            $approval->forceFill(['status' => 'expired'])->save();
        }
    }

    private function assertInteger(mixed $value, string $field): void
    {
        if (! is_int($value) && ! (is_string($value) && ctype_digit($value))) {
            throw new InvalidArgumentException("HMI approval {$field} must be an integer.");
        }
    }

    private function nonNegativeInteger(mixed $value, string $field): int
    {
        $this->assertInteger($value, $field);
        $integer = (int) $value;
        if ($integer < 0) {
            throw new InvalidArgumentException("HMI approval {$field} must be non-negative.");
        }

        return $integer;
    }

    private function normalizedCoordinate(mixed $value, string $field): float
    {
        if ((! is_int($value) && ! is_float($value))
            || ! is_finite((float) $value)
            || (float) $value < 0
            || (float) $value > 1) {
            throw new InvalidArgumentException("HMI {$field} must be finite and within [0, 1].");
        }

        return (float) $value;
    }

    private function canonicalValue(mixed $value): mixed
    {
        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map(fn (mixed $item): mixed => $this->canonicalValue($item), $value);
            }
            $keys = array_keys($value);
            sort($keys, SORT_STRING);
            $result = [];
            foreach ($keys as $key) {
                $result[$key] = $this->canonicalValue($value[$key]);
            }

            return $result;
        }

        return $value;
    }
}
