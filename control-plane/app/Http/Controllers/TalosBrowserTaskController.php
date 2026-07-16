<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosBrowserTask;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserRecoveryService;
use App\Services\Talos\Browser\TalosBrowserTakeoverService;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use InvalidArgumentException;

final class TalosBrowserTaskController extends Controller
{
    public function __construct(
        private readonly TalosBrowserTaskRepository $tasks,
        private readonly TalosBrowserTakeoverService $takeover,
        private readonly TalosBrowserTaskRuntime $runtime,
        private readonly TalosBrowserRecoveryService $recovery,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $payload = $this->validated($request, ['talos_session_id' => ['required', 'string', 'max:64']]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        $sessionId = (string) $payload['talos_session_id'];
        if ($request->header('X-Talos-Session-Id') !== $sessionId) {
            return $this->notFound();
        }

        return response()->json(['data' => TalosBrowserTask::query()
            ->ownedBy($this->userId($request))
            ->where('talos_session_id', $sessionId)
            ->orderByDesc('requested_at')
            ->get()
            ->map(fn (TalosBrowserTask $task): array => $this->taskData($task))
            ->values()]);
    }

    public function show(Request $request, string $browserTask): JsonResponse
    {
        try {
            $task = $this->ownedInChat($request, $browserTask);
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => $this->taskData($task)]);
    }

    public function events(Request $request, string $browserTask): JsonResponse
    {
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $events = $this->tasks->events($this->userId($request), $task->id);
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => $events->map(static fn ($event): array => [
            'id' => $event->id,
            'event_type' => $event->event_type,
            'actor_type' => $event->actor_type,
            'actor_id' => $event->actor_id,
            'from_status' => $event->from_status,
            'from_state_version' => $event->from_state_version,
            'to_status' => $event->to_status,
            'to_state_version' => $event->to_state_version,
            'payload' => $event->payload,
            'occurred_at' => $event->occurred_at?->toJSON(),
        ])->values()]);
    }

    public function takeover(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, $this->leaseRules());
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $grant = $this->takeover->acquire(
                $this->userId($request),
                $task->id,
                (string) $payload['owner_id'],
                (int) $payload['ttl_seconds'],
                (string) $payload['command_id'],
            );
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json([
            'data' => ['task' => $this->taskData($task->refresh()), 'lease' => $grant->toApiArray()],
        ], $grant->fencingToken === null ? 200 : 201);
    }

    public function renew(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, [
            ...$this->leaseRules(),
            'fencing_token' => ['required', 'string', 'max:256'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $grant = $this->takeover->renew(
                $this->userId($request),
                $task->id,
                (string) $payload['owner_id'],
                (string) $payload['fencing_token'],
                (int) $payload['ttl_seconds'],
                (string) $payload['command_id'],
            );
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => ['task' => $this->taskData($task->refresh()), 'lease' => $grant->toApiArray()]]);
    }

    public function returnControl(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, [
            'owner_id' => ['required', 'string', 'max:256'],
            'fencing_token' => ['required', 'string', 'max:256'],
            'command_id' => ['required', 'string', 'max:128'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $task = $this->takeover->returnControl(
                $this->userId($request),
                $task->id,
                (string) $payload['owner_id'],
                (string) $payload['fencing_token'],
                (string) $payload['command_id'],
            );
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => ['task' => $this->taskData($task)]]);
    }

    public function cancel(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, [
            'expected_state_version' => ['required', 'integer', 'min:0'],
            'command_id' => ['required', 'string', 'max:128'],
            'reason' => ['required', 'string', 'max:512'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $task = $this->runtime->cancel(
                $this->userId($request),
                $task->id,
                (int) $payload['expected_state_version'],
                (string) $payload['command_id'],
                (string) $payload['reason'],
            );
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => ['task' => $this->taskData($task)]]);
    }

    public function recover(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, [
            'command_id' => ['required', 'string', 'max:128'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $task = $this->ownedInChat($request, $browserTask);
            $decision = $this->recovery->reconcile(
                $this->userId($request),
                $task->id,
                (string) $payload['command_id'],
            );
            $task = $this->tasks->owned($this->userId($request), $task->id);
            $resultingTask = $decision->resultingTaskId !== null && $decision->resultingTaskId !== $task->id
                ? $this->tasks->owned($this->userId($request), $decision->resultingTaskId)
                : null;
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => [
            'decision' => $decision->toApiArray(),
            'task' => $this->taskData($task),
            'resulting_task' => $resultingTask instanceof TalosBrowserTask
                ? $this->taskData($resultingTask)
                : null,
        ]]);
    }

    public function fork(Request $request, string $browserTask): JsonResponse
    {
        $payload = $this->validated($request, [
            'command_id' => ['required', 'string', 'max:128'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        try {
            $source = $this->ownedInChat($request, $browserTask);
            $task = $this->runtime->fork(
                $this->userId($request),
                $source->id,
                (string) $payload['command_id'],
            );
        } catch (TalosBrowserTaskException $exception) {
            return $this->taskError($exception);
        } catch (InvalidArgumentException $exception) {
            return $this->invalidCommand($exception);
        }

        return response()->json(['data' => [
            'source_task' => $this->taskData($source->refresh()),
            'task' => $this->taskData($task),
        ]], 201);
    }

    private function ownedInChat(Request $request, string $taskId): TalosBrowserTask
    {
        $task = $this->tasks->owned($this->userId($request), $taskId);
        if ($request->header('X-Talos-Session-Id') !== $task->talos_session_id) {
            throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_NOT_FOUND', 'Browser task was not found.');
        }

        return $task;
    }

    /** @return array<string, mixed> */
    private function taskData(TalosBrowserTask $task): array
    {
        return [
            'id' => $task->id,
            'talos_session_id' => $task->talos_session_id,
            'origin_message_id' => $task->origin_message_id,
            'browser_session_id' => $task->browser_session_id,
            'runtime_id' => $task->runtime_id,
            'active_tab_id' => $task->active_tab_id,
            'goal' => $task->goal,
            'status' => $task->status,
            'autonomy_profile' => $task->autonomy_profile,
            'budget' => $task->budget,
            'state_version' => $task->state_version,
            'requested_at' => $task->requested_at?->toJSON(),
            'started_at' => $task->started_at?->toJSON(),
            'completed_at' => $task->completed_at?->toJSON(),
            'failed_at' => $task->failed_at?->toJSON(),
            'cancelled_at' => $task->cancelled_at?->toJSON(),
            'reconciled_at' => $task->reconciled_at?->toJSON(),
            'created_at' => $task->created_at?->toJSON(),
            'updated_at' => $task->updated_at?->toJSON(),
        ];
    }

    /** @return array<string, list<string>> */
    private function leaseRules(): array
    {
        return [
            'owner_id' => ['required', 'string', 'max:256'],
            'ttl_seconds' => ['required', 'integer', 'min:15', 'max:300'],
            'command_id' => ['required', 'string', 'max:128'],
        ];
    }

    private function userId(Request $request): int
    {
        $user = $request->user();

        return $user instanceof User ? (int) $user->id : 0;
    }

    private function taskError(TalosBrowserTaskException $exception): JsonResponse
    {
        $status = $exception->errorCode === 'TALOS_BROWSER_TASK_NOT_FOUND' ? 404 : 409;

        return response()->json([
            'code' => $exception->errorCode,
            'message' => $exception->getMessage(),
            'remediation' => $exception->remediation ?? ($exception->errorCode === 'TALOS_BROWSER_TAKEOVER_EVIDENCE_REQUIRED'
                ? 'Capture a fresh Browser snapshot, then retry return control.'
                : 'Refresh the Browser task state and retry with its current lease.'),
            'details' => $exception->details,
        ], $status);
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_TASK_NOT_FOUND', 'message' => 'Browser task was not found.', 'details' => []], 404);
    }

    private function invalidCommand(InvalidArgumentException $exception): JsonResponse
    {
        return response()->json([
            'code' => 'TALOS_BROWSER_VALIDATION_FAILED',
            'message' => $exception->getMessage(),
            'details' => [],
        ], 422);
    }

    /** @param array<string, mixed> $rules @return array<string, mixed>|JsonResponse */
    private function validated(Request $request, array $rules): array|JsonResponse
    {
        $validator = Validator::make($request->all(), $rules);

        return $validator->fails()
            ? response()->json(['code' => 'TALOS_BROWSER_VALIDATION_FAILED', 'message' => 'Browser task request validation failed.', 'details' => $validator->errors()->toArray()], 422)
            : $validator->validated();
    }
}
