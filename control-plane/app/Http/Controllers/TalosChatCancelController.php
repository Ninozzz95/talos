<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Chat\TalosStreamEventProjector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class TalosChatCancelController extends Controller
{
    public function __construct(private readonly TalosStreamEventProjector $projector) {}

    public function __invoke(Request $request, TalosRun $run): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $ownerUserId = (int) $user->id;
        abort_unless((int) $run->user_id === $ownerUserId, 404);

        $result = DB::transaction(function () use ($ownerUserId, $run): array {
            $lockedRun = TalosRun::query()
                ->whereKey($run->id)
                ->where('user_id', $ownerUserId)
                ->lockForUpdate()
                ->first();
            abort_unless($lockedRun instanceof TalosRun, 404);

            if (in_array((string) $lockedRun->status, ['succeeded', 'failed'], true)) {
                return ['conflict' => true];
            }

            $alreadyCancelled = $lockedRun->status === 'cancelled';
            $cancelledAt = $lockedRun->completed_at ?? now();
            if (! $alreadyCancelled) {
                $lockedRun->forceFill([
                    'status' => 'cancelled',
                    'completed_at' => $cancelledAt,
                ])->save();
            }

            $turn = TalosToolTurn::query()
                ->ownedBy($ownerUserId)
                ->where('run_id', $lockedRun->id)
                ->lockForUpdate()
                ->first();
            if ($turn instanceof TalosToolTurn
                && ! in_array((string) $turn->status, ['completed', 'failed'], true)) {
                $turn->forceFill([
                    'status' => 'cancelled',
                    'provider_operation_status' => $turn->provider_operation_status === 'in_flight'
                        ? 'cancelled'
                        : $turn->provider_operation_status,
                    'pending_tool_call_ids' => [],
                    'cancel_requested_at' => $turn->cancel_requested_at ?? $cancelledAt,
                    'completed_at' => $turn->completed_at ?? $cancelledAt,
                    'revision' => ((int) $turn->revision) + 1,
                ])->save();
            }

            $event = $lockedRun->events()
                ->where('event_type', 'run.cancelled')
                ->oldest('sequence')
                ->first();
            $envelope = $event instanceof TalosRunEvent
                ? $this->projector->envelope($event)
                : $this->projector->projectLifecycle(
                    $ownerUserId,
                    $lockedRun,
                    'run.cancelled',
                    ['reason' => 'user_requested'],
                );

            return [
                'conflict' => false,
                'run' => $lockedRun->refresh(),
                'event' => $envelope,
                'already_cancelled' => $alreadyCancelled,
            ];
        }, 3);

        if (($result['conflict'] ?? false) === true) {
            return response()->json([
                'error' => [
                    'code' => 'TALOS_RUN_NOT_CANCELLABLE',
                    'message' => 'A completed TALOS run cannot be cancelled.',
                ],
            ], 409);
        }

        /** @var TalosRun $cancelledRun */
        $cancelledRun = $result['run'];

        return response()->json([
            'data' => [
                'run' => $cancelledRun->toApiArray(),
                'event' => $result['event'],
                'already_cancelled' => $result['already_cancelled'],
            ],
        ]);
    }
}
