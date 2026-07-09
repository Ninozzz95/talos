<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchJob;
use App\Models\User;
use App\Services\Research\TalosResearchJobService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

final class TalosResearchJobController extends Controller
{
    public function __construct(
        private readonly TalosResearchJobService $jobs,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:1', 'max:20000'],
            'settings' => ['sometimes', 'nullable', 'array'],
            'settings.mode' => ['sometimes', 'string', Rule::in(['deterministic_fixture'])],
            'settings.rounds' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'settings.source_budget' => ['sometimes', 'integer', 'min:1', 'max:25'],
        ]);

        $user = Auth::user();
        abort_unless($user !== null, 401);
        assert($user instanceof User);

        $job = $this->jobs->start($validated, $user);

        return response()->json(['data' => $job->toApiArray()], 201);
    }

    public function show(TalosResearchJob $job): JsonResponse
    {
        $this->authorizeJob($job);

        return response()->json(['data' => $job->toApiArray()]);
    }

    public function cancel(TalosResearchJob $job): JsonResponse
    {
        $this->authorizeJob($job);

        return response()->json(['data' => $this->jobs->cancel($job)->toApiArray()]);
    }

    public function fixtures(Request $request, TalosResearchJob $job): JsonResponse
    {
        $this->authorizeJob($job);

        $validated = $request->validate([
            'sources' => ['required', 'array', 'min:1', 'max:25'],
            'sources.*.client_id' => ['required', 'string', 'min:1', 'max:128', 'distinct'],
            'sources.*.source_type' => ['sometimes', 'nullable', 'string', 'max:64'],
            'sources.*.url' => ['required', 'url', 'max:2048'],
            'sources.*.title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sources.*.status' => ['sometimes', 'string', Rule::in(['fetched', 'failed', 'planned'])],
            'sources.*.excerpt' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'sources.*.failure_reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'sources.*.metadata' => ['sometimes', 'nullable', 'array'],
            'sources.*.claims' => ['sometimes', 'array', 'max:20'],
            'sources.*.claims.*.text' => ['required_with:sources.*.claims', 'string', 'min:1', 'max:50000'],
            'sources.*.claims.*.confidence' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1'],
            'sources.*.claims.*.metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        /** @var list<array<string, mixed>> $sources */
        $sources = $validated['sources'];
        $report = $this->jobs->advanceWithFixtures($job->load('run'), $sources);
        $job->refresh();

        return response()->json([
            'data' => [
                'job' => $job->toApiArray(),
                'report' => $report->toApiArray(includeDetails: true),
            ],
        ]);
    }

    private function authorizeJob(TalosResearchJob $job): void
    {
        abort_unless(Auth::id() === $job->user_id, 404);
    }
}
