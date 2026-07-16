<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserTask;
use App\Models\TalosBrowserTaskEvent;
use BackedEnum;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use JsonSerializable;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Tool\ProceduralLoopGuard;

final readonly class TalosBrowserTaskRepository
{
    private const EVENT_SCHEMA_VERSION = 'talos.browser.task-event.v1';

    public function __construct(private TalosBrowserTaskReducer $reducer) {}

    /** @param array<string, mixed> $attributes */
    public function create(
        array $attributes,
        string $commandId,
        string $actorType,
        ?string $actorId = null,
    ): TalosBrowserTask {
        $ownerUserId = $this->positiveOwnerId($attributes['user_id'] ?? null);
        $commandId = $this->boundedIdentifier($commandId, 'Browser task command ID', 128);
        $actorType = $this->boundedIdentifier($actorType, 'Browser task actor type', 32);
        $actorId = $this->optionalBoundedIdentifier($actorId, 'Browser task actor ID', 256);
        $commandHash = $this->commandHash([
            'operation' => 'create',
            'event_type' => 'task.created',
            'target_status' => $attributes['status'] ?? null,
            'expected_version' => null,
            'state_payload' => $attributes,
            'event_payload' => [],
            'actor_type' => $actorType,
            'actor_id' => $actorId,
        ]);

        try {
            return DB::transaction(function () use (
                $attributes,
                $ownerUserId,
                $commandId,
                $commandHash,
                $actorType,
                $actorId,
            ): TalosBrowserTask {
                $replayed = $this->replayedCommand($ownerUserId, $commandId, $commandHash);
                if ($replayed !== null) {
                    return $replayed;
                }

                $task = TalosBrowserTask::query()->create($attributes);
                $core = $task->toCoreContract();
                if ($core->status !== BrowserTaskStatus::Created || $core->stateVersion !== 0) {
                    throw new TalosBrowserTaskException(
                        'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                        'A Browser task must be created in the canonical created state at version zero.',
                    );
                }

                $this->appendEvent(
                    $task,
                    $commandId,
                    $commandHash,
                    'task.created',
                    $actorType,
                    $actorId,
                    null,
                    null,
                    $core->status,
                    $core->stateVersion,
                    [],
                );

                return $task->refresh();
            });
        } catch (QueryException $exception) {
            $replayed = $this->replayedCommand($ownerUserId, $commandId, $commandHash, false);
            if ($replayed !== null) {
                return $replayed;
            }

            throw $exception;
        }
    }

    /**
     * @param  array<string, mixed>  $statePatch
     * @param  array<string, mixed>  $eventPayload
     */
    public function transition(
        int $ownerUserId,
        string $taskId,
        BrowserTaskStatus $next,
        int $expectedVersion,
        string $commandId,
        string $eventType,
        string $actorType,
        ?string $actorId = null,
        array $statePatch = [],
        array $eventPayload = [],
    ): TalosBrowserTask {
        $ownerUserId = $this->positiveOwnerId($ownerUserId);
        $taskId = $this->boundedIdentifier($taskId, 'Browser task ID', 255);
        $commandId = $this->boundedIdentifier($commandId, 'Browser task command ID', 128);
        $eventType = $this->boundedIdentifier($eventType, 'Browser task event type', 128);
        $actorType = $this->boundedIdentifier($actorType, 'Browser task actor type', 32);
        $actorId = $this->optionalBoundedIdentifier($actorId, 'Browser task actor ID', 256);
        if ($expectedVersion < 0) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_STATE_CONFLICT',
                'Browser task state version must be non-negative.',
            );
        }
        $commandHash = $this->commandHash([
            'operation' => 'transition',
            'task_id' => $taskId,
            'event_type' => $eventType,
            'target_status' => $next->value,
            'expected_version' => $expectedVersion,
            'state_payload' => $statePatch,
            'event_payload' => $eventPayload,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
        ]);

        return DB::transaction(function () use (
            $ownerUserId,
            $taskId,
            $next,
            $expectedVersion,
            $commandId,
            $commandHash,
            $eventType,
            $actorType,
            $actorId,
            $statePatch,
            $eventPayload,
        ): TalosBrowserTask {
            $replayed = $this->replayedCommand($ownerUserId, $commandId, $commandHash, true, $taskId);
            if ($replayed !== null) {
                return $replayed;
            }

            $task = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($taskId)
                ->lockForUpdate()
                ->first();
            if (! $task instanceof TalosBrowserTask) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_NOT_FOUND',
                    'Browser task was not found.',
                );
            }
            if ($task->state_version !== $expectedVersion) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_STATE_CONFLICT',
                    'Browser task state changed before this command could be applied.',
                );
            }

            try {
                $nextCore = $this->reducer->transition($task, $next, $expectedVersion);
            } catch (InvalidArgumentException $exception) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                    'Browser task transition is not allowed from its current state.',
                );
            }

            $fromStatus = (string) $task->status;
            if (! $task->compareAndSwapState($expectedVersion, $nextCore->status->value, $statePatch)) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_STATE_CONFLICT',
                    'Browser task state changed before this command could be committed.',
                );
            }

            $this->appendEvent(
                $task,
                $commandId,
                $commandHash,
                $eventType,
                $actorType,
                $actorId,
                $fromStatus,
                $expectedVersion,
                $nextCore->status,
                $nextCore->stateVersion,
                $eventPayload,
            );

            return $task->refresh();
        });
    }

    public function owned(int $ownerUserId, string $taskId): TalosBrowserTask
    {
        $task = TalosBrowserTask::query()
            ->ownedBy($this->positiveOwnerId($ownerUserId))
            ->whereKey($taskId)
            ->first();
        if (! $task instanceof TalosBrowserTask) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_NOT_FOUND',
                'Browser task was not found.',
            );
        }

        return $task;
    }

    /** @return Collection<int, TalosBrowserTaskEvent> */
    public function events(int $ownerUserId, string $taskId): Collection
    {
        $task = $this->owned($ownerUserId, $taskId);

        return TalosBrowserTaskEvent::query()
            ->ownedBy($ownerUserId)
            ->where('task_id', $task->id)
            ->orderBy('to_state_version')
            ->orderBy('id')
            ->get();
    }

    private function replayedCommand(
        int $ownerUserId,
        string $commandId,
        string $commandHash,
        bool $lock = true,
        ?string $taskId = null,
    ): ?TalosBrowserTask {
        $query = TalosBrowserTaskEvent::query()
            ->ownedBy($ownerUserId)
            ->where('command_id', $commandId);
        if ($lock) {
            $query->lockForUpdate();
        }
        $event = $query->first();
        if (! $event instanceof TalosBrowserTaskEvent) {
            return null;
        }
        if (! hash_equals((string) $event->command_sha256, $commandHash)
            || ($taskId !== null && $event->task_id !== $taskId)) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'Browser task command ID was already used for a different intent.',
            );
        }

        return $this->owned($ownerUserId, (string) $event->task_id);
    }

    /** @param array<string, mixed> $payload */
    private function appendEvent(
        TalosBrowserTask $task,
        string $commandId,
        string $commandHash,
        string $eventType,
        string $actorType,
        ?string $actorId,
        ?string $fromStatus,
        ?int $fromStateVersion,
        BrowserTaskStatus $toStatus,
        int $toStateVersion,
        array $payload,
    ): void {
        TalosBrowserTaskEvent::query()->create([
            'schema_version' => self::EVENT_SCHEMA_VERSION,
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'command_id' => $commandId,
            'command_sha256' => $commandHash,
            'event_type' => $eventType,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'from_status' => $fromStatus,
            'from_state_version' => $fromStateVersion,
            'to_status' => $toStatus->value,
            'to_state_version' => $toStateVersion,
            'payload' => $this->normalizeForHash($payload),
            'occurred_at' => now(),
        ]);
    }

    /** @param array<string, mixed> $intent */
    private function commandHash(array $intent): string
    {
        return 'sha256:'.hash(
            'sha256',
            ProceduralLoopGuard::canonicalJson($this->normalizeForHash($intent)),
        );
    }

    private function normalizeForHash(mixed $value): mixed
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d\TH:i:s.uP');
        }
        if ($value instanceof BackedEnum) {
            return $value->value;
        }
        if ($value instanceof JsonSerializable) {
            return $this->normalizeForHash($value->jsonSerialize());
        }
        if (is_array($value)) {
            return array_map($this->normalizeForHash(...), $value);
        }
        if (is_scalar($value) || $value === null) {
            return $value;
        }

        throw new InvalidArgumentException('Browser task command intent is not JSON-compatible.');
    }

    private function positiveOwnerId(mixed $value): int
    {
        if (! is_int($value) && ! (is_string($value) && ctype_digit($value))) {
            throw new InvalidArgumentException('Browser task owner ID must be a positive integer.');
        }
        $ownerUserId = (int) $value;
        if ($ownerUserId < 1) {
            throw new InvalidArgumentException('Browser task owner ID must be a positive integer.');
        }

        return $ownerUserId;
    }

    private function boundedIdentifier(string $value, string $label, int $maxLength): string
    {
        $value = trim($value);
        if ($value === '' || mb_strlen($value) > $maxLength) {
            throw new InvalidArgumentException("{$label} must contain between 1 and {$maxLength} characters.");
        }

        return $value;
    }

    private function optionalBoundedIdentifier(?string $value, string $label, int $maxLength): ?string
    {
        if ($value === null) {
            return null;
        }

        return $this->boundedIdentifier($value, $label, $maxLength);
    }
}
