<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosModelComparison;
use App\Models\User;
use App\Services\Models\TalosModelComparisonService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

final class TalosModelComparisonController extends Controller
{
    public function __construct(
        private readonly TalosModelComparisonService $comparisons,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'prompt' => ['required', 'string', 'min:1', 'max:20000'],
            'mode' => ['sometimes', 'string', Rule::in(['blind', 'parallel', 'shuffle'])],
            'task_type' => ['sometimes', 'string', Rule::in(['chat', 'agent', 'search', 'research'])],
            'blind' => ['sometimes', 'boolean'],
            'timeout_seconds' => ['sometimes', 'integer', 'min:5', 'max:300'],
            'model_profile_ids' => ['required', 'array', 'min:2', 'max:3'],
            'model_profile_ids.*' => ['required', 'string', 'distinct', 'exists:talos_model_profiles,id'],
        ]);

        $user = Auth::user();
        abort_unless($user !== null, 401);
        assert($user instanceof User);

        $comparison = $this->comparisons->create($validated, $user);

        return response()->json(['data' => $comparison->toApiArray()], 201);
    }

    public function show(TalosModelComparison $comparison): JsonResponse
    {
        $this->authorizeComparison($comparison);
        $comparison->load(['lanes.modelProfile']);

        return response()->json(['data' => $comparison->toApiArray()]);
    }

    public function vote(Request $request, TalosModelComparison $comparison): JsonResponse
    {
        $this->authorizeComparison($comparison);
        $validated = $request->validate([
            'lane_id' => ['required', 'string'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'scorecard' => ['sometimes', 'nullable', 'array'],
            'scorecard.usefulness' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'scorecard.correctness' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'scorecard.evidence' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'scorecard.formatting' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'scorecard.speed' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'scorecard.cost' => ['sometimes', 'integer', 'min:1', 'max:5'],
        ]);

        $comparison = $this->comparisons->vote($comparison->load('lanes'), $validated);

        return response()->json(['data' => $comparison->toApiArray(includeReveal: true)]);
    }

    public function benchmark(TalosModelComparison $comparison): JsonResponse
    {
        $this->authorizeComparison($comparison);
        $group = $this->comparisons->promoteToBenchmark($comparison);

        return response()->json(['data' => $group->toApiArray(includeResults: true)], 201);
    }

    private function authorizeComparison(TalosModelComparison $comparison): void
    {
        abort_unless(Auth::id() === $comparison->user_id, 404);
    }
}
