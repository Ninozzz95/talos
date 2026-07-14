<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class TalosExecutionClaimService
{
    private const LEASE_SECONDS = 180;

    /** @return array{token: string, expires_at: \Illuminate\Support\Carbon} */
    public function newTurnLease(string $phase): array
    {
        $this->assertPhase($phase);

        return [
            'token' => (string) Str::uuid(),
            'expires_at' => now()->addSeconds(self::LEASE_SECONDS),
        ];
    }

    public function claimTurn(int $ownerUserId, string $turnId, string $phase): ?string
    {
        $this->assertPhase($phase);
        $this->ownedTurn($ownerUserId, $turnId);
        $token = (string) Str::uuid();

        $claimed = TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->whereNotIn('status', ['completed', 'failed', 'cancelled', 'recovery_required'])
            ->where(function (Builder $query): void {
                $query->whereNull('execution_lease_token')
                    ->orWhereNull('execution_lease_expires_at')
                    ->orWhere('execution_lease_expires_at', '<=', now());
            })
            ->update([
                'execution_lease_token' => $token,
                'execution_lease_expires_at' => now()->addSeconds(self::LEASE_SECONDS),
                'execution_lease_phase' => $phase,
                'revision' => \DB::raw('revision + 1'),
                'updated_at' => now(),
            ]);

        return $claimed === 1 ? $token : null;
    }

    public function renewTurn(int $ownerUserId, string $turnId, string $token, string $phase): bool
    {
        $this->assertPhase($phase);
        $this->assertToken($token);

        return TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->where('execution_lease_token', $token)
            ->where('execution_lease_expires_at', '>', now())
            ->whereNotIn('status', ['completed', 'failed', 'cancelled', 'recovery_required'])
            ->update([
                'execution_lease_expires_at' => now()->addSeconds(self::LEASE_SECONDS),
                'execution_lease_phase' => $phase,
                'updated_at' => now(),
            ]) === 1;
    }

    public function releaseTurn(int $ownerUserId, string $turnId, string $token): bool
    {
        $this->assertToken($token);

        return TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->where('execution_lease_token', $token)
            ->update([
                'execution_lease_token' => null,
                'execution_lease_expires_at' => null,
                'execution_lease_phase' => null,
                'updated_at' => now(),
            ]) === 1;
    }

    public function claimCall(
        int $ownerUserId,
        string $callId,
        string $effectKey,
        string $turnLeaseToken,
    ): ?string
    {
        $this->assertEffectKey($effectKey);
        $this->assertToken($turnLeaseToken);

        return \DB::transaction(function () use ($ownerUserId, $callId, $effectKey, $turnLeaseToken): ?string {
            $identity = $this->ownedCallIdentity($ownerUserId, $callId);
            $turn = $this->lockOwnedTurn($ownerUserId, (string) $identity->tool_turn_id);
            if (! $this->ownsLiveTurnLease($turn, $turnLeaseToken)) {
                return null;
            }
            $call = $this->lockOwnedCallForTurn(
                $ownerUserId,
                $callId,
                (string) $turn->id,
            );
            if ($call->effect_status === 'completed' || $call->results()->where('attempt', $call->attempt)->exists()) {
                return null;
            }
            if ($call->effect_status === 'in_flight') {
                if ($call->execution_lease_expires_at?->isPast()) {
                    $call->forceFill([
                        'status' => 'recovery_required',
                        'effect_status' => 'recovery_required',
                        'execution_token' => null,
                        'execution_lease_expires_at' => null,
                    ])->save();
                }

                return null;
            }
            if ($call->effect_status === 'recovery_required') {
                return null;
            }
            if (is_string($call->effect_key) && ! hash_equals($call->effect_key, $effectKey)) {
                throw new InvalidArgumentException('Tool call effect key does not match its persisted claim.');
            }

            $token = (string) Str::uuid();
            $call->forceFill([
                'status' => 'running',
                'execution_token' => $token,
                'execution_lease_expires_at' => now()->addSeconds(self::LEASE_SECONDS),
                'effect_key' => $effectKey,
                'effect_status' => 'in_flight',
            ])->save();

            return $token;
        }, 3);
    }

    public function authorizeCallExecution(
        int $ownerUserId,
        string $callId,
        string $token,
        string $turnLeaseToken,
    ): bool {
        $this->assertToken($token);
        $this->assertToken($turnLeaseToken);

        return \DB::transaction(function () use ($ownerUserId, $callId, $token, $turnLeaseToken): bool {
            $identity = $this->ownedCallIdentity($ownerUserId, $callId);
            $turn = $this->lockOwnedTurn($ownerUserId, (string) $identity->tool_turn_id);
            $call = $this->lockOwnedCallForTurn(
                $ownerUserId,
                $callId,
                (string) $turn->id,
            );
            if (! is_string($call->execution_token)
                || ! hash_equals($call->execution_token, $token)
                || $call->effect_status !== 'in_flight') {
                return false;
            }

            if ($this->ownsLiveTurnLease($turn, $turnLeaseToken)
                && $call->execution_lease_expires_at?->isFuture()) {
                return true;
            }

            $this->quarantineLockedCall($call);

            return false;
        }, 3);
    }

    public function completeCall(
        int $ownerUserId,
        string $callId,
        string $token,
        string $turnLeaseToken,
    ): bool
    {
        $this->assertToken($token);
        $this->assertToken($turnLeaseToken);

        return \DB::transaction(function () use ($ownerUserId, $callId, $token, $turnLeaseToken): bool {
            $identity = $this->ownedCallIdentity($ownerUserId, $callId);
            $turn = $this->lockOwnedTurn($ownerUserId, (string) $identity->tool_turn_id);
            $call = $this->lockOwnedCallForTurn(
                $ownerUserId,
                $callId,
                (string) $turn->id,
            );
            if (! $this->ownsLiveTurnLease($turn, $turnLeaseToken)
                || ! is_string($call->execution_token)
                || ! hash_equals($call->execution_token, $token)
                || $call->effect_status !== 'in_flight'
                || ! $call->execution_lease_expires_at?->isFuture()) {
                return false;
            }
            $call->forceFill([
                'effect_status' => 'completed',
                'execution_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();

            return true;
        }, 3);
    }

    public function releaseCall(
        int $ownerUserId,
        string $callId,
        string $token,
        string $turnLeaseToken,
    ): bool
    {
        $this->assertToken($token);
        $this->assertToken($turnLeaseToken);

        return \DB::transaction(function () use ($ownerUserId, $callId, $token, $turnLeaseToken): bool {
            $identity = $this->ownedCallIdentity($ownerUserId, $callId);
            $turn = $this->lockOwnedTurn($ownerUserId, (string) $identity->tool_turn_id);
            $call = $this->lockOwnedCallForTurn(
                $ownerUserId,
                $callId,
                (string) $turn->id,
            );
            $ownsEffect = is_string($call->execution_token)
                && hash_equals($call->execution_token, $token)
                && $call->effect_status === 'in_flight';
            if (! $this->ownsLiveTurnLease($turn, $turnLeaseToken)) {
                if ($ownsEffect) {
                    $this->quarantineLockedCall($call);
                }

                return false;
            }
            if (! is_string($call->execution_token)
                || ! hash_equals($call->execution_token, $token)
                || $call->effect_status !== 'in_flight') {
                return false;
            }
            $call->forceFill([
                'status' => 'proposed',
                'effect_status' => 'ready',
                'execution_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();

            return true;
        }, 3);
    }

    public function quarantineCall(int $ownerUserId, string $callId, string $token): bool
    {
        $this->assertToken($token);

        return \DB::transaction(function () use ($ownerUserId, $callId, $token): bool {
            $identity = $this->ownedCallIdentity($ownerUserId, $callId);
            $turn = $this->lockOwnedTurn($ownerUserId, (string) $identity->tool_turn_id);
            $call = $this->lockOwnedCallForTurn(
                $ownerUserId,
                $callId,
                (string) $turn->id,
            );
            if (! is_string($call->execution_token)
                || ! hash_equals($call->execution_token, $token)
                || $call->effect_status !== 'in_flight') {
                return false;
            }

            $this->quarantineLockedCall($call);

            return true;
        }, 3);
    }

    private function ownedCallIdentity(int $ownerUserId, string $callId): TalosToolCall
    {
        $call = TalosToolCall::query()
            ->ownedBy($ownerUserId)
            ->whereKey($callId)
            ->first();
        if (! $call instanceof TalosToolCall) {
            throw new InvalidArgumentException('Tool call is not owned by the requested user.');
        }

        return $call;
    }

    private function lockOwnedTurn(int $ownerUserId, string $turnId): TalosToolTurn
    {
        $turn = TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->lockForUpdate()
            ->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new InvalidArgumentException('Tool turn is not owned by the requested user.');
        }

        return $turn;
    }

    private function lockOwnedCallForTurn(
        int $ownerUserId,
        string $callId,
        string $turnId,
    ): TalosToolCall {
        $call = TalosToolCall::query()
            ->ownedBy($ownerUserId)
            ->whereKey($callId)
            ->where('tool_turn_id', $turnId)
            ->lockForUpdate()
            ->first();
        if (! $call instanceof TalosToolCall) {
            throw new InvalidArgumentException('Tool call ownership changed while acquiring its execution fence.');
        }

        return $call;
    }

    private function ownsLiveTurnLease(TalosToolTurn $turn, string $token): bool
    {
        return is_string($turn->execution_lease_token)
            && hash_equals($turn->execution_lease_token, $token)
            && $turn->execution_lease_expires_at?->isFuture()
            && ! in_array($turn->status, ['completed', 'failed', 'cancelled', 'recovery_required'], true);
    }

    private function quarantineLockedCall(TalosToolCall $call): void
    {
        $call->forceFill([
            'status' => 'recovery_required',
            'effect_status' => 'recovery_required',
            'execution_token' => null,
            'execution_lease_expires_at' => null,
        ])->save();
    }

    private function ownedTurn(int $ownerUserId, string $turnId): TalosToolTurn
    {
        $turn = TalosToolTurn::query()->ownedBy($ownerUserId)->whereKey($turnId)->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new InvalidArgumentException('Tool turn is not owned by the requested user.');
        }

        return $turn;
    }

    private function assertPhase(string $phase): void
    {
        if (trim($phase) === '' || strlen($phase) > 64) {
            throw new InvalidArgumentException('Execution lease phase is invalid.');
        }
    }

    private function assertToken(string $token): void
    {
        if (trim($token) === '' || strlen($token) > 64) {
            throw new InvalidArgumentException('Execution fencing token is invalid.');
        }
    }

    private function assertEffectKey(string $effectKey): void
    {
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $effectKey) !== 1) {
            throw new InvalidArgumentException('Tool effect key is invalid.');
        }
    }
}
