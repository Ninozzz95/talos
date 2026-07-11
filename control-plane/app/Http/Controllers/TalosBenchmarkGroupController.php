<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosBenchmarkGroup;
use App\Models\TalosBenchmarkResult;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosBenchmarkGroupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);

        $groups = TalosBenchmarkGroup::query()
            ->where('user_id', $userId)
            ->withCount('results')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosBenchmarkGroup $group): array => $this->redactPaths($group->toApiArray()))
            ->values();

        return response()->json(['data' => $groups]);
    }

    public function show(Request $request, TalosBenchmarkGroup $benchmarkGroup): JsonResponse
    {
        $this->assertGroupOwnedByCurrentUser($request, $benchmarkGroup);
        $benchmarkGroup->load('results');

        return response()->json(['data' => $this->redactPaths($benchmarkGroup->toApiArray(includeResults: true))]);
    }

    public function export(Request $request, TalosBenchmarkGroup $benchmarkGroup): JsonResponse
    {
        $this->assertGroupOwnedByCurrentUser($request, $benchmarkGroup);
        $benchmarkGroup->load('results');
        $exportReadiness = $this->exportReadiness($benchmarkGroup);
        $modelComparison = $this->isModelComparison($benchmarkGroup);

        if (! $exportReadiness['complete']) {
            return response()->json([
                'schema_version' => 1,
                'error' => 'BENCHMARK_EXPORT_INCOMPLETE',
                'message' => $modelComparison
                    ? 'Model comparison export requires at least two provider-backed lanes with matching fairness hashes and raw reports.'
                    : 'Benchmark export requires complete AVM ON/OFF evidence with matching fairness hashes and raw reports.',
                'export_status' => 'not_ready',
                'missing_modes' => $exportReadiness['missing_modes'],
                'failed_modes' => $exportReadiness['failed_modes'],
                'fairness_violations' => $exportReadiness['fairness_violations'],
                'evidence_violations' => $exportReadiness['evidence_violations'],
            ], 422);
        }

        $payload = [
            'schema_version' => 1,
            'report_type' => $modelComparison ? 'talos_model_comparison_export' : 'talos_benchmark_export',
            'benchmark_kind' => $modelComparison ? 'model_profile_comparison' : 'avm_on_off',
            'export_status' => 'complete',
            'generated_at' => now()->toJSON(),
            'benchmark_group' => $this->redactPaths($benchmarkGroup->toApiArray()),
            'fairness_contract' => $modelComparison ? [
                'same_prompt' => $benchmarkGroup->prompt_hash,
                'same_context' => $benchmarkGroup->context_hash,
                'same_evaluator' => $benchmarkGroup->evaluator_version,
                'model_axis' => 'intentionally_varied',
            ] : [
                'same_prompt' => $benchmarkGroup->prompt_hash,
                'same_context' => $benchmarkGroup->context_hash,
                'same_evaluator' => $benchmarkGroup->evaluator_version,
                'same_model' => $benchmarkGroup->model,
            ],
            'results' => $benchmarkGroup->results
                ->sortBy('mode')
                ->map(fn ($result): array => $this->redactPaths($result->toApiArray()))
                ->values()
                ->all(),
        ];

        TalosAuditEvent::record('benchmark_report.exported', 'benchmark_group', $benchmarkGroup->id, [
            'results_count' => count($payload['results']),
            'scenario_hash' => $benchmarkGroup->scenario_hash,
            'prompt_hash' => $benchmarkGroup->prompt_hash,
            'context_hash' => $benchmarkGroup->context_hash,
        ]);

        return response()
            ->json($payload)
            ->header('Content-Disposition', 'attachment; filename="talos-benchmark-'.$benchmarkGroup->id.'.json"');
    }

    /**
     * @return array{complete: bool, missing_modes: list<string>, failed_modes: list<string>, fairness_violations: list<string>, evidence_violations: list<string>}
     */
    private function exportReadiness(TalosBenchmarkGroup $benchmarkGroup): array
    {
        $modelComparison = $this->isModelComparison($benchmarkGroup);
        $requiredModes = $modelComparison
            ? $benchmarkGroup->results
                ->pluck('mode')
                ->filter(fn ($mode): bool => is_string($mode) && preg_match('/^model_lane_[a-c]$/', $mode) === 1)
                ->sort()
                ->values()
                ->all()
            : ['avm_on', 'avm_off_direct'];
        $resultsByMode = $benchmarkGroup->results->keyBy('mode');
        $missingModes = [];
        $failedModes = [];
        $fairnessViolations = [];
        $evidenceViolations = [];

        if ($modelComparison && count($requiredModes) < 2) {
            $missingModes[] = 'model_lane_pair';
        }

        if (! is_string($benchmarkGroup->prompt_hash) || $benchmarkGroup->prompt_hash === '') {
            $fairnessViolations[] = 'group_prompt_hash_missing';
        }

        if (! is_string($benchmarkGroup->context_hash) || $benchmarkGroup->context_hash === '') {
            $fairnessViolations[] = 'group_context_hash_missing';
        }

        if (! is_string($benchmarkGroup->evaluator_version) || $benchmarkGroup->evaluator_version === '') {
            $fairnessViolations[] = 'group_evaluator_missing';
        }

        if (! is_string($benchmarkGroup->model) || $benchmarkGroup->model === '') {
            $fairnessViolations[] = 'group_model_missing';
        }

        foreach ($requiredModes as $mode) {
            /** @var TalosBenchmarkResult|null $result */
            $result = $resultsByMode->get($mode);
            if (! $result instanceof TalosBenchmarkResult) {
                $missingModes[] = $mode;
                continue;
            }

            if ($this->isFailedResult($result)) {
                $failedModes[] = $mode;
            }

            if ($result->prompt_hash !== $benchmarkGroup->prompt_hash) {
                $fairnessViolations[] = 'result_prompt_hash_mismatch:'.$mode;
            }

            if ($result->context_hash !== $benchmarkGroup->context_hash) {
                $fairnessViolations[] = 'result_context_hash_mismatch:'.$mode;
            }

            if ($result->evaluator_version !== $benchmarkGroup->evaluator_version) {
                $fairnessViolations[] = 'result_evaluator_mismatch:'.$mode;
            }

            if (! is_array($result->raw_report) || $result->raw_report === []) {
                $evidenceViolations[] = 'raw_report_missing:'.$mode;
            }
        }

        return [
            'complete' => $missingModes === [] && $failedModes === [] && $fairnessViolations === [] && $evidenceViolations === [],
            'missing_modes' => $missingModes,
            'failed_modes' => $failedModes,
            'fairness_violations' => $fairnessViolations,
            'evidence_violations' => $evidenceViolations,
        ];
    }

    private function isFailedResult(TalosBenchmarkResult $result): bool
    {
        return strtolower((string) $result->status) === 'failed';
    }

    private function isModelComparison(TalosBenchmarkGroup $benchmarkGroup): bool
    {
        return ($benchmarkGroup->metadata['comparison_type'] ?? null) === 'model_profile_blind_compare';
    }

    private function currentUserId(Request $request): int
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return (int) $user->id;
    }

    private function assertGroupOwnedByCurrentUser(Request $request, TalosBenchmarkGroup $benchmarkGroup): void
    {
        abort_unless((int) $benchmarkGroup->user_id === $this->currentUserId($request), 404);
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
        return strtolower($key) === 'path' || str_ends_with(strtolower($key), '_path');
    }

    private function isAbsoluteFilesystemPath(string $value): bool
    {
        return str_starts_with(strtolower($value), 'file://')
            || str_starts_with($value, '/')
            || str_starts_with($value, '\\\\')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $value) === 1;
    }
}
