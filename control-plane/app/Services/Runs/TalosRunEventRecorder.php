<?php

declare(strict_types=1);

namespace App\Services\Runs;

use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use Illuminate\Support\Facades\DB;
use LogicException;

final class TalosRunEventRecorder
{
    public function __construct(private readonly RunEventNormalizer $normalizer) {}

    /**
     * @param array{run_id: string, user_id: int|string} $owner
     * @param array<string, mixed> $event
     */
    public function record(array $owner, array $event): TalosRunEvent
    {
        $runId = $owner['run_id'] ?? null;
        $userId = $owner['user_id'] ?? null;

        if (! is_string($runId) || trim($runId) === '') {
            throw new LogicException('A non-empty run_id is required for event ownership.');
        }

        if (is_string($userId) && ctype_digit($userId)) {
            $userId = (int) $userId;
        }

        if (! is_int($userId) || $userId < 1) {
            throw new LogicException('A positive user_id is required for event ownership.');
        }

        $this->assertEventOwnership($event, $runId, $userId);

        return DB::transaction(function () use ($runId, $userId, $event): TalosRunEvent {
            /** @var TalosRun $run */
            $run = TalosRun::query()
                ->whereKey($runId)
                ->lockForUpdate()
                ->firstOrFail();

            if ((int) $run->user_id !== $userId) {
                throw new LogicException('The event owner does not match the run owner.');
            }

            $nextSequence = ((int) $run->events()->max('sequence')) + 1;
            $normalized = $this->normalizer->normalize($event);

            /** @var TalosRunEvent $recorded */
            $recorded = $run->events()->create([
                ...$normalized,
                'sequence' => $nextSequence,
                'occurred_at' => now(),
            ]);

            return $recorded;
        });
    }

    /**
     * @param array<string, mixed> $event
     */
    private function assertEventOwnership(array $event, string $runId, int $userId): void
    {
        if (array_key_exists('run_id', $event) && (string) $event['run_id'] !== $runId) {
            throw new LogicException('The event run_id does not match its owner.');
        }

        if (array_key_exists('user_id', $event) && (int) $event['user_id'] !== $userId) {
            throw new LogicException('The event user_id does not match its owner.');
        }
    }
}
