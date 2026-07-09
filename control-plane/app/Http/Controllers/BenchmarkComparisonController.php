<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Benchmarking\BenchmarkComparisonService;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class BenchmarkComparisonController extends Controller
{
    public function __construct(private readonly BenchmarkComparisonService $benchmarks)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scenario_path' => ['required', 'string'],
            'runs' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        $scenarioPath = (string) $validated['scenario_path'];
        if (! $this->isPrivateBenchmarkScenarioPath($scenarioPath)) {
            throw ValidationException::withMessages([
                'scenario_path' => 'The scenario path must be a private benchmark scenario path.',
            ]);
        }

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $report = $this->benchmarks->compare($scenarioPath, (int) ($validated['runs'] ?? 1), null, $user);

        return response()->json($report);
    }

    private function isPrivateBenchmarkScenarioPath(string $path): bool
    {
        return str_starts_with($path, 'benchmark-scenarios/')
            && str_ends_with($path, '.json')
            && ! str_contains($path, '..')
            && preg_match('/^[A-Za-z0-9_\/.-]+$/', $path) === 1;
    }
}
