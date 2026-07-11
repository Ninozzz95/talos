<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Benchmarking\BenchmarkComparisonService;
use App\Services\Benchmarking\UserBenchmarkScenarioResolver;
use App\Models\TalosBenchmarkGroup;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BenchmarkComparisonController extends Controller
{
    public function __construct(
        private readonly BenchmarkComparisonService $benchmarks,
        private readonly UserBenchmarkScenarioResolver $scenarioResolver,
    )
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scenario_ref' => ['required', 'uuid'],
            'runs' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $scenarioPath = $this->scenarioResolver->resolve((string) $validated['scenario_ref'], $user);

        $report = $this->benchmarks->compare($scenarioPath, (int) ($validated['runs'] ?? 1), null, $user);

        $groupId = $report['benchmark_group']['id'] ?? null;
        if (is_string($groupId)) {
            $group = TalosBenchmarkGroup::query()->findOrFail($groupId);
            $group->update(['metadata' => [
                ...($group->metadata ?? []),
                'scenario_ref' => (string) $validated['scenario_ref'],
            ]]);
            $report['benchmark_group'] = $group->fresh()->toApiArray();
        }

        return response()->json($this->redactPaths($report));
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function redactPaths(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (is_string($key) && $this->isPathField($key)) {
                unset($payload[$key]);
            } elseif (is_array($value)) {
                $payload[$key] = $this->redactPaths($value);
            } elseif (is_string($value) && $this->isAbsoluteFilesystemPath($value)) {
                unset($payload[$key]);
            }
        }

        return $payload;
    }

    private function isPathField(string $key): bool
    {
        return $key === 'path'
            || $key === 'scenario_path'
            || $key === 'storage_path'
            || str_ends_with($key, '_storage_path');
    }

    private function isAbsoluteFilesystemPath(string $value): bool
    {
        return str_starts_with($value, '/')
            || str_starts_with($value, '\\\\')
            || str_starts_with($value, 'file://')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $value) === 1;
    }
}
