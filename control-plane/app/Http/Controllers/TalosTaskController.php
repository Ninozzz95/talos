<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosRun;
use App\Models\TalosTask;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class TalosTaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);

        $tasks = TalosTask::query()
            ->where('user_id', $userId)
            ->latest('created_at')
            ->get()
            ->map(fn (TalosTask $task): array => $task->toApiArray())
            ->values();

        return response()->json(['data' => $tasks]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);
        $validated = $request->validate([
            'run_id' => ['sometimes', 'nullable', 'string', 'exists:talos_runs,id'],
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['open', 'in_progress', 'done', 'cancelled'])],
            'priority' => ['sometimes', 'nullable', 'string', Rule::in(['low', 'normal', 'high', 'critical'])],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);
        $this->assertRunOwnedByCurrentUser($validated, $userId);

        $task = TalosTask::query()->create([
            ...$validated,
            'user_id' => $userId,
            'status' => $validated['status'] ?? 'open',
            'priority' => $validated['priority'] ?? 'normal',
        ]);
        assert($task instanceof TalosTask);

        return response()->json(['data' => $task->toApiArray()], 201);
    }

    private function currentUserId(Request $request): int
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return (int) $user->id;
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function assertRunOwnedByCurrentUser(array $validated, int $userId): void
    {
        if (! filled($validated['run_id'] ?? null)) {
            return;
        }

        if (! TalosRun::query()->where('user_id', $userId)->whereKey((string) $validated['run_id'])->exists()) {
            throw ValidationException::withMessages([
                'run_id' => ['The selected run does not belong to the current user.'],
            ]);
        }
    }
}
