<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosToolTurn;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class TalosProceduralGuardCheckpointStore
{
    public function load(TalosToolTurn $turn): TalosProceduralGuardCheckpoint
    {
        $encoded = $turn->loop_guard_state;
        $checksum = $turn->loop_guard_state_sha256;
        if ($encoded === null && $checksum === null) {
            return TalosProceduralGuardCheckpoint::fresh();
        }
        if (! is_string($encoded)
            || ! is_string($checksum)
            || ! hash_equals($checksum, 'sha256:'.hash('sha256', $encoded))) {
            throw new InvalidArgumentException('Procedural guard checkpoint integrity failed.');
        }

        return TalosProceduralGuardCheckpoint::fromEncoded($encoded);
    }

    public function persist(
        int $ownerUserId,
        string $turnId,
        string $leaseToken,
        TalosProceduralGuardCheckpoint $checkpoint,
    ): TalosToolTurn {
        $encoded = $checkpoint->encode();
        $checksum = 'sha256:'.hash('sha256', $encoded);

        return DB::transaction(function () use ($ownerUserId, $turnId, $leaseToken, $checkpoint, $encoded, $checksum): TalosToolTurn {
            $turn = TalosToolTurn::query()
                ->ownedBy($ownerUserId)
                ->whereKey($turnId)
                ->where('execution_lease_token', $leaseToken)
                ->where('execution_lease_expires_at', '>', now())
                ->lockForUpdate()
                ->first();
            if (! $turn instanceof TalosToolTurn
                || in_array($turn->status, ['completed', 'failed', 'cancelled'], true)) {
                throw new TalosProviderRecoveryRequiredException(
                    faultCode: 'TALOS_AGENT_CHECKPOINT_FENCED',
                    message: 'Procedural guard checkpoint was fenced by a newer or expired turn lease.',
                );
            }

            $turn->forceFill([
                'loop_guard_state' => $encoded,
                'loop_guard_state_sha256' => $checksum,
                'repair_attempt' => $checkpoint->maximumRepairAttempt(),
                'revision' => ((int) $turn->revision) + 1,
            ])->save();

            return $turn;
        }, 3);
    }
}
