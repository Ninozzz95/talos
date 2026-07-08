<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosMemory;
use App\Services\Memory\TalosMemoryRetrievalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosMemoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $memories = TalosMemory::query()
            ->when(! $request->boolean('include_inactive'), fn ($query) => $query->where('status', 'active'))
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosMemory $memory): array => $memory->toApiArray())
            ->values();

        return response()->json(['data' => $memories]);
    }

    public function store(Request $request): JsonResponse
    {
        $memory = TalosMemory::query()->create($this->validated($request, true));

        return response()->json(['data' => $memory->toApiArray()], 201);
    }

    public function retrievalContext(Request $request, TalosMemoryRetrievalService $retrieval): JsonResponse
    {
        $validated = $request->validate([
            'scope_type' => ['required', 'string', Rule::in(['global', 'project', 'session'])],
            'scope_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        return response()->json([
            'data' => $retrieval->context(
                (string) $validated['scope_type'],
                $validated['scope_id'] ?? null,
                (int) ($validated['limit'] ?? 20),
            ),
        ]);
    }

    public function show(TalosMemory $memory): JsonResponse
    {
        return response()->json(['data' => $memory->toApiArray(includeContent: true)]);
    }

    public function update(Request $request, TalosMemory $memory): JsonResponse
    {
        $memory->update($this->validated($request, false));

        return response()->json(['data' => $memory->refresh()->toApiArray()]);
    }

    public function destroy(TalosMemory $memory): JsonResponse
    {
        $memory->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $create): array
    {
        return $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'scope_type' => [$create ? 'required' : 'sometimes', 'string', Rule::in(['global', 'project', 'session'])],
            'scope_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'kind' => [$create ? 'required' : 'sometimes', 'string', Rule::in(['preference', 'project_fact', 'procedure', 'policy_note', 'rejected'])],
            'status' => ['sometimes', 'string', Rule::in(['active', 'disabled', 'quarantined', 'rejected'])],
            'title' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:255'],
            'content' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:20000'],
            'source' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'last_used_at' => ['sometimes', 'nullable', 'date'],
        ]);
    }
}
