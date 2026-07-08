<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosTaskController extends Controller
{
    public function index(): JsonResponse
    {
        $tasks = TalosTask::query()
            ->latest('created_at')
            ->get()
            ->map(fn (TalosTask $task): array => $task->toApiArray())
            ->values();

        return response()->json(['data' => $tasks]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'run_id' => ['sometimes', 'nullable', 'string', 'exists:talos_runs,id'],
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['open', 'in_progress', 'done', 'cancelled'])],
            'priority' => ['sometimes', 'nullable', 'string', Rule::in(['low', 'normal', 'high', 'critical'])],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $task = TalosTask::query()->create([
            ...$validated,
            'status' => $validated['status'] ?? 'open',
            'priority' => $validated['priority'] ?? 'normal',
        ]);
        assert($task instanceof TalosTask);

        return response()->json(['data' => $task->toApiArray()], 201);
    }
}
