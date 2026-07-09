<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosRun;
use App\Models\User;
use App\Services\Benchmarking\BenchmarkComparisonService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TalosRunBenchmarkController extends Controller
{
    public function __construct(private readonly BenchmarkComparisonService $benchmarks)
    {
    }

    public function __invoke(Request $request, TalosRun $run): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $run->user_id === (int) $user->id, 404);

        $validated = $request->validate([
            'runs' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        if (! is_string($run->prompt) || trim($run->prompt) === '') {
            throw ValidationException::withMessages([
                'run' => 'The selected run does not contain a persisted prompt to benchmark.',
            ]);
        }

        $report = $this->benchmarks->compareRun($run, (int) ($validated['runs'] ?? 1));

        return response()->json($report, 201);
    }
}
