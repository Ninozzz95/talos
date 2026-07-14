<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosToolBudgetReservation;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class TalosAgentBudgetService
{
    /** @var list<string> */
    private const RESOURCES = [
        'calls',
        'navigations',
        'screenshots',
        'evidence_nodes',
        'evidence_bytes',
        'elapsed_ms',
        'input_tokens',
        'output_tokens',
        'cost_micros',
    ];

    public function reserve(
        int $ownerUserId,
        string $turnId,
        string $reservationId,
        string $kind,
        string $resource,
        mixed $amount,
        ?string $toolCallId = null,
        array $metadata = [],
        ?string $turnLeaseToken = null,
    ): TalosToolBudgetReservation {
        $amount = $this->nonNegativeInteger($amount, 'Reservation amount');
        $this->validateResource($resource);
        $this->validateNonEmpty($reservationId, 'Reservation ID');
        $this->validateNonEmpty($kind, 'Reservation kind');

        return DB::transaction(function () use (
            $ownerUserId,
            $turnId,
            $reservationId,
            $kind,
            $resource,
            $amount,
            $toolCallId,
            $metadata,
            $turnLeaseToken,
        ): TalosToolBudgetReservation {
            $turn = $this->lockTurn($turnId, $ownerUserId, $turnLeaseToken);

            if ($toolCallId !== null && ! TalosToolCall::query()
                ->ownedBy($ownerUserId)
                ->whereKey($toolCallId)
                ->where('tool_turn_id', $turn->id)
                ->exists()) {
                throw new InvalidArgumentException('Tool call is not owned by the requested user and turn.');
            }

            $existing = TalosToolBudgetReservation::query()
                ->where('reservation_id', $reservationId)
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                if (! $this->sameReservationIdentity(
                    $existing,
                    $ownerUserId,
                    $turn->id,
                    $toolCallId,
                    $kind,
                    $resource,
                    $amount,
                    $metadata,
                )) {
                    throw new InvalidArgumentException('Reservation ID is already in use.');
                }

                return $existing;
            }

            $limit = $this->policyLimit($turn, $resource);
            $consumed = $this->consumedAmount($turn, $resource);

            if ($amount > $limit - $consumed) {
                throw new InvalidArgumentException("Budget exceeded for resource {$resource}.");
            }

            return TalosToolBudgetReservation::query()->create([
                'tool_turn_id' => $turn->id,
                'run_id' => $turn->run_id,
                'user_id' => $ownerUserId,
                'tool_call_id' => $toolCallId,
                'reservation_id' => $reservationId,
                'kind' => $kind,
                'resource' => $resource,
                'reserved_amount' => $amount,
                'settled_amount' => null,
                'status' => 'reserved',
                'metadata' => $metadata,
            ]);
        }, 3);
    }

    /** @param array<string, mixed> $metadata */
    private function sameReservationIdentity(
        TalosToolBudgetReservation $reservation,
        int $ownerUserId,
        string $turnId,
        ?string $toolCallId,
        string $kind,
        string $resource,
        int $amount,
        array $metadata,
    ): bool {
        $existingToolCallId = $reservation->tool_call_id;
        $toolCallMatches = ($existingToolCallId === null && $toolCallId === null)
            || ($existingToolCallId !== null && $toolCallId !== null && (string) $existingToolCallId === $toolCallId);

        return (int) $reservation->user_id === $ownerUserId
            && (string) $reservation->tool_turn_id === $turnId
            && $toolCallMatches
            && (string) $reservation->kind === $kind
            && (string) $reservation->resource === $resource
            && (int) $reservation->reserved_amount === $amount
            && $reservation->metadata === $metadata;
    }

    public function settle(
        string $reservationId,
        int $ownerUserId,
        mixed $settledAmount,
        ?string $turnLeaseToken = null,
    ): TalosToolBudgetReservation
    {
        $settledAmount = $this->nonNegativeInteger($settledAmount, 'Settled amount');

        return DB::transaction(function () use ($reservationId, $ownerUserId, $settledAmount, $turnLeaseToken): TalosToolBudgetReservation {
            $reservation = $this->ownedReservation($reservationId, $ownerUserId);
            $this->lockTurn($reservation->tool_turn_id, $ownerUserId, $turnLeaseToken);
            $reservation = $this->lockOwnedReservation((string) $reservation->getKey(), $ownerUserId);

            if ($reservation->status === 'settled') {
                if ((int) $reservation->settled_amount !== $settledAmount) {
                    throw new InvalidArgumentException('Settled reservation cannot be changed.');
                }

                return $reservation;
            }

            if ($reservation->status !== 'reserved') {
                throw new InvalidArgumentException('Only a reserved budget can be settled.');
            }

            if ($settledAmount > (int) $reservation->reserved_amount) {
                throw new InvalidArgumentException('Settled amount cannot exceed the reservation.');
            }

            $reservation->forceFill([
                'settled_amount' => $settledAmount,
                'status' => 'settled',
            ])->save();

            return $reservation->refresh();
        }, 3);
    }

    public function release(
        string $reservationId,
        int $ownerUserId,
        ?string $turnLeaseToken = null,
    ): TalosToolBudgetReservation
    {
        return DB::transaction(function () use ($reservationId, $ownerUserId, $turnLeaseToken): TalosToolBudgetReservation {
            $reservation = $this->ownedReservation($reservationId, $ownerUserId);
            $this->lockTurn($reservation->tool_turn_id, $ownerUserId, $turnLeaseToken);
            $reservation = $this->lockOwnedReservation((string) $reservation->getKey(), $ownerUserId);

            if ($reservation->status === 'released') {
                return $reservation;
            }

            if ($reservation->status !== 'reserved') {
                throw new InvalidArgumentException('Only a reserved budget can be released.');
            }

            $reservation->forceFill([
                'settled_amount' => null,
                'status' => 'released',
            ])->save();

            return $reservation->refresh();
        }, 3);
    }

    public function consumedForTurn(int $ownerUserId, string $turnId, string $resource): int
    {
        $this->validateResource($resource);
        $turn = TalosToolTurn::query()->ownedBy($ownerUserId)->whereKey($turnId)->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new InvalidArgumentException('Tool turn is not owned by the requested user.');
        }

        return $this->consumedAmount($turn, $resource);
    }

    private function ownedReservation(string $reservationId, int $ownerUserId): TalosToolBudgetReservation
    {
        $this->validateNonEmpty($reservationId, 'Reservation ID');

        $reservation = TalosToolBudgetReservation::query()
            ->ownedBy($ownerUserId)
            ->where('reservation_id', $reservationId)
            ->first();

        if ($reservation === null) {
            throw new InvalidArgumentException('Reservation is not owned by the requested user.');
        }

        return $reservation;
    }

    private function lockOwnedReservation(string $reservationPrimaryKey, int $ownerUserId): TalosToolBudgetReservation
    {
        $reservation = TalosToolBudgetReservation::query()
            ->ownedBy($ownerUserId)
            ->whereKey($reservationPrimaryKey)
            ->lockForUpdate()
            ->first();

        if ($reservation === null) {
            throw new InvalidArgumentException('Reservation is no longer owned by the requested user.');
        }

        return $reservation;
    }

    private function lockTurn(
        string $turnId,
        int $ownerUserId,
        ?string $turnLeaseToken,
    ): TalosToolTurn
    {
        $turn = TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->lockForUpdate()
            ->first();

        if ($turn === null) {
            throw new InvalidArgumentException('Reservation turn is not owned by the requested user.');
        }

        $persistedToken = $turn->execution_lease_token;
        if ($persistedToken !== null || $turnLeaseToken !== null) {
            if (! is_string($persistedToken)
                || ! is_string($turnLeaseToken)
                || ! hash_equals($persistedToken, $turnLeaseToken)
                || ! $turn->execution_lease_expires_at?->isFuture()
                || in_array($turn->status, ['completed', 'failed', 'cancelled', 'recovery_required'], true)) {
                throw new TalosToolRecoveryRequiredException(
                    message: 'The budget reservation was fenced by a different procedural turn owner.',
                );
            }
        }

        return $turn;
    }

    private function consumedAmount(TalosToolTurn $turn, string $resource): int
    {
        $amount = TalosToolBudgetReservation::query()
            ->where('tool_turn_id', $turn->id)
            ->where('resource', $resource)
            ->whereIn('status', ['reserved', 'settled'])
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN status = ? THEN reserved_amount ELSE COALESCE(settled_amount, reserved_amount) END), 0) AS amount',
                ['reserved'],
            )
            ->value('amount');

        return (int) $amount;
    }

    private function policyLimit(TalosToolTurn $turn, string $resource): int
    {
        $policy = $turn->budget_policy;
        $key = 'max_'.$resource;
        $limit = is_array($policy) && array_key_exists($key, $policy)
            ? $policy[$key]
            : (is_array($policy) && array_key_exists($resource, $policy) ? $policy[$resource] : null);

        if (! is_int($limit) || $limit < 0) {
            throw new InvalidArgumentException("Budget policy does not define a valid limit for {$resource}.");
        }

        return $limit;
    }

    private function validateResource(string $resource): void
    {
        if (! in_array($resource, self::RESOURCES, true)) {
            throw new InvalidArgumentException("Unsupported budget resource {$resource}.");
        }
    }

    private function validateNonEmpty(string $value, string $label): void
    {
        if (trim($value) === '') {
            throw new InvalidArgumentException("{$label} must not be empty.");
        }
    }

    private function nonNegativeInteger(mixed $value, string $label): int
    {
        if (! is_int($value) || $value < 0) {
            throw new InvalidArgumentException("{$label} must be a non-negative integer.");
        }

        return $value;
    }
}
