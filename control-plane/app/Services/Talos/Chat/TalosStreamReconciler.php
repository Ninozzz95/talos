<?php

declare(strict_types=1);

namespace App\Services\Talos\Chat;

use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use LogicException;

final class TalosStreamReconciler
{
    public const PUBLIC_EVENT_KINDS = [
        'run.started',
        'reasoning.delta',
        'text.delta',
        'tool.started',
        'tool.progress',
        'tool.completed',
        'usage.updated',
        'artifact.created',
        'message.completed',
        'run.failed',
        'run.cancelled',
        'stream.heartbeat',
    ];

    public function __construct(private readonly TalosStreamEventProjector $projector) {}

    /** @return array<string, mixed> */
    public function snapshot(int $ownerUserId, TalosRun $run, int $afterSequence = 0): array
    {
        if ((int) $run->user_id !== $ownerUserId) {
            throw new LogicException('The stream reconciliation owner does not match the run owner.');
        }
        if ($afterSequence < 0) {
            throw new LogicException('The stream reconciliation sequence must be non-negative.');
        }

        $events = $run->events()
            ->where('sequence', '>', $afterSequence)
            ->whereIn('event_type', self::PUBLIC_EVENT_KINDS)
            ->oldest('sequence')
            ->get()
            ->map(fn (TalosRunEvent $event): array => $this->projector->envelope($event))
            ->values()
            ->all();
        $message = TalosMessage::query()
            ->where('session_id', $run->session_id)
            ->where('run_id', $run->id)
            ->where('role', 'assistant')
            ->first();

        return [
            'contract' => TalosStreamEventProjector::CONTRACT,
            'run' => $run->fresh()?->toApiArray() ?? $run->toApiArray(),
            'events' => $events,
            'assistant_message' => $message instanceof TalosMessage
                ? $this->assistantMessage($message)
                : null,
            'last_sequence' => (int) $run->events()->max('sequence'),
            'terminal' => in_array((string) $run->fresh()?->status, [
                'succeeded',
                'failed',
                'cancelled',
            ], true),
        ];
    }

    /** @return array<string, mixed> */
    private function assistantMessage(TalosMessage $message): array
    {
        return [
            'id' => (string) $message->id,
            'session_id' => (string) $message->session_id,
            'role' => (string) $message->role,
            'content' => (string) $message->content,
            'model_profile_id' => $message->model_profile_id,
            'run_id' => $message->run_id,
            'request_key' => $message->request_key,
            'metadata' => is_array($message->metadata) ? $message->metadata : [],
            'created_at' => $message->created_at?->toJSON(),
            'updated_at' => $message->updated_at?->toJSON(),
        ];
    }
}
