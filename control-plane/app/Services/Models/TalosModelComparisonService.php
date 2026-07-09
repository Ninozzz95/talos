<?php

declare(strict_types=1);

namespace App\Services\Models;

use App\Models\TalosBenchmarkGroup;
use App\Models\TalosBenchmarkResult;
use App\Models\TalosModelComparison;
use App\Models\TalosModelComparisonLane;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TalosModelComparisonService
{
    /**
     * @param array<string, mixed> $payload
     */
    public function create(array $payload, User $user): TalosModelComparison
    {
        $profileIds = $payload['model_profile_ids'];
        assert(is_array($profileIds));
        $profiles = $this->loadProfiles($profileIds, $user);

        return DB::transaction(function () use ($payload, $user, $profiles): TalosModelComparison {
            $prompt = (string) $payload['prompt'];
            $mode = (string) ($payload['mode'] ?? 'blind');
            $taskType = (string) ($payload['task_type'] ?? 'chat');
            $blind = in_array($mode, ['blind', 'shuffle'], true)
                ? true
                : (array_key_exists('blind', $payload) ? (bool) $payload['blind'] : true);
            $shuffleSeed = crc32($prompt.implode('|', $profiles->pluck('id')->sort()->values()->all()));
            $orderedProfiles = $this->orderedProfiles($profiles, $blind, $shuffleSeed);

            $comparison = TalosModelComparison::query()->create([
                'user_id' => $user->id,
                'prompt' => $prompt,
                'mode' => $mode,
                'task_type' => $taskType,
                'blind' => $blind,
                'shuffle_seed' => $shuffleSeed,
                'status' => 'running',
                'timeout_seconds' => (int) ($payload['timeout_seconds'] ?? 60),
                'metadata' => [
                    'prompt_hash' => hash('sha256', $prompt),
                    'context_hash' => hash('sha256', 'no-context'),
                    'evaluator_version' => 'talos-model-comparison-v1',
                ],
            ]);
            assert($comparison instanceof TalosModelComparison);

            $hasFailedLane = false;
            foreach ($orderedProfiles->values() as $index => $profile) {
                assert($profile instanceof TalosModelProfile);
                $alias = 'Model '.chr(65 + $index);
                $isFailed = $profile->status === 'failed';
                $hasFailedLane = $hasFailedLane || $isFailed;

                $run = TalosRun::query()->create([
                    'user_id' => $user->id,
                    'model_profile_id' => $profile->id,
                    'mode' => 'model_comparison_lane',
                    'status' => $isFailed ? 'failed' : 'succeeded',
                    'prompt_hash' => hash('sha256', $prompt),
                    'prompt' => $prompt,
                    'provider' => $profile->provider,
                    'model' => $profile->model,
                    'metadata' => [
                        'source' => 'model_comparison',
                        'comparison_id' => $comparison->id,
                        'display_alias' => $alias,
                    ],
                    'started_at' => now(),
                    'completed_at' => now(),
                ]);
                assert($run instanceof TalosRun);

                $lane = $comparison->lanes()->create([
                    'model_profile_id' => $profile->id,
                    'display_alias' => $alias,
                    'position' => $index + 1,
                    'weight' => 100,
                    'status' => $isFailed ? 'failed' : 'completed',
                    'response_text' => $isFailed ? null : $this->deterministicResponse($alias, $taskType, $prompt),
                    'latency_ms' => $isFailed ? null : 320 + ($index * 75),
                    'cost' => $isFailed ? null : (0.0015 + ($index * 0.0007)),
                    'run_id' => $run->id,
                    'error_code' => $isFailed ? 'MODEL_PROFILE_DEGRADED' : null,
                    'error_message' => $isFailed ? 'The selected model profile is marked failed, so TALOS preserved the lane as failed evidence.' : null,
                    'metadata' => [
                        'trace_replayable' => true,
                        'context_coverage' => 'not_measured',
                    ],
                ]);
                assert($lane instanceof TalosModelComparisonLane);
            }

            $comparison->update([
                'status' => $hasFailedLane ? 'completed_with_errors' : 'completed',
            ]);

            return $comparison->fresh(['lanes.modelProfile']);
        });
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function vote(TalosModelComparison $comparison, array $payload): TalosModelComparison
    {
        if ($comparison->revealed_at !== null) {
            abort(response()->json([
                'code' => 'MODEL_COMPARISON_ALREADY_REVEALED',
                'message' => 'This comparison has already been voted and revealed.',
            ], 409));
        }

        $lane = $comparison->lanes()->whereKey((string) $payload['lane_id'])->first();
        if (! $lane instanceof TalosModelComparisonLane) {
            throw ValidationException::withMessages([
                'lane_id' => ['Selected lane does not belong to this comparison.'],
            ]);
        }

        $comparison->update([
            'winner_lane_id' => $lane->id,
            'revealed_at' => now(),
            'scorecard' => [
                'reason' => $payload['reason'] ?? null,
                'criteria' => $payload['scorecard'] ?? [],
            ],
        ]);

        return $comparison->fresh(['lanes.modelProfile']);
    }

    public function promoteToBenchmark(TalosModelComparison $comparison): TalosBenchmarkGroup
    {
        return DB::transaction(function () use ($comparison): TalosBenchmarkGroup {
            $comparison->loadMissing(['lanes.modelProfile']);
            if (is_string($comparison->benchmark_group_id) && $comparison->benchmark_group_id !== '') {
                $existing = TalosBenchmarkGroup::query()
                    ->with('results')
                    ->whereKey($comparison->benchmark_group_id)
                    ->first();

                if ($existing instanceof TalosBenchmarkGroup) {
                    return $existing;
                }
            }

            $promptHash = hash('sha256', $comparison->prompt);
            $contextHash = hash('sha256', 'no-context');
            $scenarioBytes = json_encode([
                'type' => 'model_comparison',
                'comparison_id' => $comparison->id,
                'prompt_hash' => $promptHash,
            ], JSON_THROW_ON_ERROR);
            $sourceRunId = $comparison->lanes->sortBy('position')->first()?->run_id;

            $group = TalosBenchmarkGroup::query()->create([
                'user_id' => $comparison->user_id,
                'source_run_id' => $sourceRunId,
                'name' => 'Model comparison: '.mb_substr($comparison->prompt, 0, 80),
                'scenario_path' => 'talos://model-comparisons/'.$comparison->id,
                'scenario_hash' => hash('sha256', $scenarioBytes),
                'prompt_hash' => $promptHash,
                'context_hash' => $contextHash,
                'model' => 'model-comparison',
                'evaluator_version' => 'talos-model-comparison-v1',
                'metadata' => [
                    'comparison_type' => 'model_profile_blind_compare',
                    'model_comparison_id' => $comparison->id,
                ],
            ]);
            assert($group instanceof TalosBenchmarkGroup);

            foreach ($comparison->lanes->sortBy('position')->values() as $index => $lane) {
                assert($lane instanceof TalosModelComparisonLane);
                $result = $group->results()->create([
                    'mode' => 'model_lane_'.strtolower(chr(65 + $index)),
                    'label' => $lane->display_alias,
                    'status' => $lane->status === 'completed' ? 'complete' : 'failed',
                    'prompt_hash' => $promptHash,
                    'context_hash' => $contextHash,
                    'evaluator_version' => 'talos-model-comparison-v1',
                    'metrics' => [
                        'latency_ms' => $lane->latency_ms,
                        'cost' => $lane->cost !== null ? (float) $lane->cost : null,
                    ],
                    'raw_report' => [
                        'lane_id' => $lane->id,
                        'display_alias' => $lane->display_alias,
                        'status' => $lane->status,
                        'response_text' => $lane->response_text,
                        'error_code' => $lane->error_code,
                    ],
                    'trace_replayable' => $lane->run_id !== null,
                ]);
                assert($result instanceof TalosBenchmarkResult);
            }

            $comparison->update(['benchmark_group_id' => $group->id]);

            return $group->load('results');
        });
    }

    /**
     * @param list<string> $profileIds
     * @return \Illuminate\Support\Collection<int, TalosModelProfile>
     */
    private function loadProfiles(array $profileIds, User $user): \Illuminate\Support\Collection
    {
        $profiles = TalosModelProfile::query()
            ->whereIn('id', $profileIds)
            ->where('user_id', $user->id)
            ->get()
            ->keyBy('id');

        if ($profiles->count() !== count($profileIds)) {
            throw ValidationException::withMessages([
                'model_profile_ids' => ['All selected model profiles must belong to the current user.'],
            ]);
        }

        foreach ($profileIds as $profileId) {
            /** @var TalosModelProfile $profile */
            $profile = $profiles->get($profileId);
            if ($profile->status === 'disabled') {
                throw ValidationException::withMessages([
                    'model_profile_ids' => ['Disabled model profiles cannot be compared.'],
                ]);
            }

            if (! filled($profile->encrypted_secret)) {
                throw ValidationException::withMessages([
                    'model_profile_ids' => ['Every compared model profile must have a server-side secret.'],
                ]);
            }
        }

        return collect($profileIds)
            ->map(fn (string $id): TalosModelProfile => $profiles->get($id))
            ->values();
    }

    /**
     * @param \Illuminate\Support\Collection<int, TalosModelProfile> $profiles
     * @return \Illuminate\Support\Collection<int, TalosModelProfile>
     */
    private function orderedProfiles(\Illuminate\Support\Collection $profiles, bool $blind, int $seed): \Illuminate\Support\Collection
    {
        if (! $blind || $profiles->count() < 2) {
            return $profiles->values();
        }

        $ordered = $profiles
            ->sortBy(fn (TalosModelProfile $profile): string => hash('sha256', $seed.'|'.$profile->id))
            ->values();

        if ($ordered->pluck('id')->all() === $profiles->pluck('id')->all()) {
            $ordered = $ordered
                ->slice(1)
                ->concat($ordered->take(1))
                ->values();
        }

        return $ordered;
    }

    private function deterministicResponse(string $alias, string $taskType, string $prompt): string
    {
        return "{$alias} {$taskType} response: ".mb_substr($prompt, 0, 160);
    }
}
