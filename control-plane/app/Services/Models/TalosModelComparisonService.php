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
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Carbon\CarbonImmutable;
use GuzzleHttp\TransferStats;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Throwable;

final class TalosModelComparisonService
{
    private readonly PublicHttpRequestPinning $connectionPinning;

    public function __construct(?PublicHttpUrlPolicy $urlPolicy = null, ?PublicHttpRequestPinning $connectionPinning = null)
    {
        $this->connectionPinning = $connectionPinning ?? new PublicHttpRequestPinning(
            $urlPolicy ?? PublicHttpUrlPolicy::fromConfig(),
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function create(array $payload, User $user): TalosModelComparison
    {
        $profileIds = $payload['model_profile_ids'];
        assert(is_array($profileIds));
        $profiles = $this->loadProfiles($profileIds, $user);

        $prompt = (string) $payload['prompt'];
        $mode = (string) ($payload['mode'] ?? 'blind');
        $taskType = (string) ($payload['task_type'] ?? 'chat');
        $blind = in_array($mode, ['blind', 'shuffle'], true)
            ? true
            : (array_key_exists('blind', $payload) ? (bool) $payload['blind'] : true);
        $shuffleSeed = crc32($prompt.implode('|', $profiles->pluck('id')->sort()->values()->all()));
        $orderedProfiles = $this->orderedProfiles($profiles, $blind, $shuffleSeed);

        $comparison = DB::transaction(
            fn (): TalosModelComparison => TalosModelComparison::query()->create([
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
            ]),
        );
        assert($comparison instanceof TalosModelComparison);

        try {
            $hasFailedLane = false;
            $results = $this->callProviders($orderedProfiles->values(), $prompt, (int) $comparison->timeout_seconds);
            foreach ($orderedProfiles->values() as $index => $profile) {
                assert($profile instanceof TalosModelProfile);
                $alias = 'Model '.chr(65 + $index);
                $result = $results[$index];
                $isFailed = $result['status'] === 'failed';
                $hasFailedLane = $hasFailedLane || $isFailed;

                DB::transaction(function () use ($user, $profile, $prompt, $comparison, $alias, $index, $result, $isFailed): void {
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
                            'provider_http_status' => $result['http_status'],
                        ],
                        'started_at' => $result['started_at'],
                        'completed_at' => $result['completed_at'],
                    ]);
                    assert($run instanceof TalosRun);

                    $lane = $comparison->lanes()->create([
                        'model_profile_id' => $profile->id,
                        'display_alias' => $alias,
                        'position' => $index + 1,
                        'weight' => 100,
                        'status' => $isFailed ? 'failed' : 'completed',
                        'response_text' => $result['response_text'],
                        'latency_ms' => $result['latency_ms'],
                        'cost' => $result['cost'],
                        'run_id' => $run->id,
                        'error_code' => $result['error_code'],
                        'error_message' => $result['error_message'],
                        'metadata' => [
                            'trace_replayable' => false,
                            'context_coverage' => 'not_measured',
                            'evidence_source' => 'provider_http',
                            'usage' => $result['usage'],
                            'http_status' => $result['http_status'],
                        ],
                    ]);
                    assert($lane instanceof TalosModelComparisonLane);
                });
            }

            $comparison->update([
                'status' => $hasFailedLane ? 'completed_with_errors' : 'completed',
            ]);
        } catch (Throwable $exception) {
            $comparison->update(['status' => 'failed']);
            throw $exception;
        }

        return $comparison->fresh(['lanes.modelProfile']);
    }

    /**
     * @param  array<string, mixed>  $payload
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
            $hasSyntheticEvidence = $comparison->lanes->contains(
                fn (TalosModelComparisonLane $lane): bool => ($lane->metadata['evidence_source'] ?? null) !== 'provider_http'
            );
            if ($hasSyntheticEvidence) {
                throw ValidationException::withMessages([
                    'comparison' => ['Only comparisons backed by provider HTTP evidence can be promoted.'],
                ]);
            }
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
                    'trace_replayable' => false,
                ]);
                assert($result instanceof TalosBenchmarkResult);
            }

            $comparison->update(['benchmark_group_id' => $group->id]);

            return $group->load('results');
        });
    }

    /**
     * @param  list<string>  $profileIds
     * @return Collection<int, TalosModelProfile>
     */
    private function loadProfiles(array $profileIds, User $user): Collection
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

            $probeResult = is_array($profile->probe_result) ? $profile->probe_result : [];
            if ($profile->status !== 'healthy' || ($probeResult['ok'] ?? false) !== true) {
                throw ValidationException::withMessages([
                    'model_profile_ids' => ['Model profiles require successful server probe evidence before comparison.'],
                ]);
            }

            if (TalosModelProviderCatalog::requiresSecret((string) $profile->provider) && ! filled($profile->encrypted_secret)) {
                throw ValidationException::withMessages([
                    'model_profile_ids' => ['The selected remote model profile requires a server-side secret.'],
                ]);
            }

            if (! in_array((string) $profile->provider, TalosModelProviderCatalog::ids(), true)) {
                throw ValidationException::withMessages([
                    'model_profile_ids' => ['The selected model provider is not supported for comparison.'],
                ]);
            }
        }

        return collect($profileIds)
            ->map(fn (string $id): TalosModelProfile => $profiles->get($id))
            ->values();
    }

    /**
     * @param  Collection<int, TalosModelProfile>  $profiles
     * @return Collection<int, TalosModelProfile>
     */
    private function orderedProfiles(Collection $profiles, bool $blind, int $seed): Collection
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

    /**
     * @return array{status: string, response_text: ?string, latency_ms: int, cost: ?float, usage: array<string, mixed>, http_status: ?int, error_code: ?string, error_message: ?string, started_at: ?CarbonImmutable, completed_at: ?CarbonImmutable}
     */
    private function callProviders(Collection $profiles, string $prompt, int $timeoutSeconds): array
    {
        $prepared = [];
        $results = [];
        $timings = [];
        foreach ($profiles as $index => $profile) {
            assert($profile instanceof TalosModelProfile);
            $timing = $this->newTiming();
            $this->startTiming($timing);
            $timings[$index] = $timing;
            $provider = (string) $profile->provider;
            $url = TalosModelProviderCatalog::chatEndpointUrl($provider, $profile->base_url);
            $localOllama = $provider === 'ollama'
                && TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $profile->base_url);
            if (TalosModelProviderCatalog::requiresTrustedLocalBaseUrl($provider) && ! $localOllama) {
                $this->completeTiming($timing);
                $results[$index] = $this->failedCall(
                    'BASE_URL_POLICY_BLOCKED',
                    'The local provider endpoint must use an approved loopback host.',
                    $this->requestLatency(null, $timing),
                    timing: $timing,
                );

                continue;
            }

            $connectionPin = $this->connectionPinning->pin($url, $localOllama);
            if (! $connectionPin['allowed']) {
                $this->completeTiming($timing);
                $results[$index] = $this->failedCall(
                    (string) $connectionPin['code'],
                    'The provider connection could not be pinned to an approved public IP address.',
                    $this->requestLatency(null, $timing),
                    timing: $timing,
                );

                continue;
            }

            $secret = null;
            try {
                if (! $localOllama && filled($profile->encrypted_secret)) {
                    $secret = Crypt::decryptString((string) $profile->encrypted_secret);
                }
            } catch (Throwable) {
                $this->completeTiming($timing);
                $results[$index] = $this->failedCall(
                    'PROVIDER_SECRET_DECRYPT_FAILED',
                    'The provider secret could not be decrypted.',
                    $this->requestLatency(null, $timing),
                    timing: $timing,
                );

                continue;
            }

            $prepared[$index] = [
                'provider' => $provider,
                'secret' => $secret,
                'url' => $url,
                'payload' => $provider === 'anthropic'
                    ? ['model' => $profile->model, 'max_tokens' => 1024, 'messages' => [['role' => 'user', 'content' => $prompt]]]
                    : ['model' => $profile->model, 'messages' => [['role' => 'user', 'content' => $prompt]]],
                'connection_pin' => $connectionPin,
            ];
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($prepared, $timeoutSeconds, &$timings): array {
                $requests = [];
                foreach ($prepared as $index => $call) {
                    $timing = $timings[$index];
                    $request = $this->connectionPinning->apply(
                        $pool->as((string) $index)
                            ->timeout($timeoutSeconds)
                            ->acceptJson()
                            ->beforeSending(static function ($request, array $options) use ($timing) {
                                self::startTransferTiming($timing);
                            })
                            ->withRequestMiddleware(static function ($request) use ($timing) {
                                self::startTransferTiming($timing);

                                return $request;
                            })
                            ->withResponseMiddleware(static function ($response) use ($timing) {
                                if (is_int($timing->started_at_ns)) {
                                    $timing->completed_at_ns ??= hrtime(true);
                                    $timing->completed_at ??= CarbonImmutable::now();
                                }

                                return $response;
                            }),
                        $call['connection_pin'],
                    );
                    $request = $request->withOptions([
                        'on_stats' => static function (TransferStats $stats) use ($timing): void {
                            $timing->handler_stats = $stats->getHandlerStats();
                            $timing->transfer_time = $stats->getTransferTime();
                            if (is_int($timing->started_at_ns)) {
                                $timing->completed_at_ns ??= hrtime(true);
                                $timing->completed_at ??= CarbonImmutable::now();
                            }
                        },
                    ]);
                    if ($call['provider'] === 'anthropic' && filled($call['secret'])) {
                        $request = $request->withHeaders(['x-api-key' => $call['secret'], 'anthropic-version' => '2023-06-01']);
                    } elseif (filled($call['secret'])) {
                        $request = $request->withToken($call['secret']);
                    }
                    $requests[] = $request->post($call['url'], $call['payload']);
                }

                return $requests;
            });
        } catch (Throwable) {
            foreach (array_keys($prepared) as $index) {
                $timing = $timings[$index] ?? null;
                $this->completeTiming($timing);
                $results[$index] = $this->failedCall(
                    'PROVIDER_REQUEST_FAILED',
                    'The provider request failed.',
                    $this->requestLatency(null, $timing),
                    timing: $timing,
                );
            }
            ksort($results);

            return array_values($results);
        }

        foreach ($prepared as $index => $call) {
            $response = $responses[(string) $index] ?? null;
            $timing = $timings[$index] ?? null;
            $this->completeTiming($timing);
            $latency = $this->requestLatency($response instanceof Response ? $response : null, $timing);
            if ($response instanceof ConnectionException) {
                $results[$index] = $this->failedCall('PROVIDER_CONNECTION_FAILED', 'The provider connection failed.', $latency, timing: $timing);

                continue;
            }
            if (! $response instanceof Response) {
                $results[$index] = $this->failedCall('PROVIDER_REQUEST_FAILED', 'The provider request failed.', $latency, timing: $timing);

                continue;
            }
            if (! $this->connectionPinning->connectedToPinnedIp($response, $call['connection_pin'])) {
                $results[$index] = $this->failedCall('PROVIDER_CONNECTED_IP_MISMATCH', 'The provider connection did not use an approved IP address.', $latency, $response->status(), $timing);

                continue;
            }
            $results[$index] = $this->parseProviderResponse($call['provider'], $response, $latency, $timing);
        }

        ksort($results);

        return array_values($results);
    }

    private function parseProviderResponse(string $provider, Response $response, int $latency, ?object $timing = null): array
    {
        if (! $response->successful()) {
            $code = $response->status() >= 300 && $response->status() < 400
                ? 'PROVIDER_REDIRECT_BLOCKED'
                : 'PROVIDER_HTTP_ERROR';
            $message = $code === 'PROVIDER_REDIRECT_BLOCKED'
                ? 'The provider returned a redirect, which TALOS blocked before credentials could follow it.'
                : "The provider returned HTTP {$response->status()}.";

            return $this->failedCall($code, $message, $latency, $response->status(), $timing);
        }

        $json = $response->json();
        if (! is_array($json)) {
            return $this->failedCall('PROVIDER_INVALID_RESPONSE', 'The provider returned an invalid JSON response.', $latency, $response->status(), $timing);
        }

        $content = $this->responseContent($provider, $json);
        if (! is_string($content) || $content === '') {
            return $this->failedCall('PROVIDER_INVALID_RESPONSE', 'The provider response did not contain assistant text.', $latency, $response->status(), $timing);
        }

        $usage = is_array($json['usage'] ?? null) ? $json['usage'] : [];
        $cost = $usage['cost'] ?? $json['cost'] ?? null;

        return [
            'status' => 'completed', 'response_text' => $content, 'latency_ms' => $latency,
            'cost' => is_numeric($cost) ? (float) $cost : null, 'usage' => $usage,
            'http_status' => $response->status(), 'error_code' => null, 'error_message' => null,
            'started_at' => $timing?->started_at,
            'completed_at' => $timing?->completed_at,
        ];
    }

    /** @param array<string, mixed> $json */
    private function responseContent(string $provider, array $json): mixed
    {
        $contentBlocks = $json['content'] ?? null;
        if ($provider !== 'anthropic' && ! is_array($contentBlocks)) {
            return $json['choices'][0]['message']['content'] ?? null;
        }

        $textBlocks = [];
        foreach (is_array($contentBlocks) ? $contentBlocks : [] as $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== 'text' || ! is_string($block['text'] ?? null)) {
                continue;
            }

            $textBlocks[] = $block['text'];
        }

        return implode("\n", $textBlocks);
    }

    /** @return array{status: string, response_text: null, latency_ms: int, cost: null, usage: array<string, mixed>, http_status: ?int, error_code: string, error_message: string, started_at: ?CarbonImmutable, completed_at: ?CarbonImmutable} */
    private function failedCall(string $code, string $message, int $latencyMs, ?int $httpStatus = null, ?object $timing = null): array
    {
        return [
            'status' => 'failed',
            'response_text' => null,
            'latency_ms' => $latencyMs,
            'cost' => null,
            'usage' => [],
            'http_status' => $httpStatus,
            'error_code' => $code,
            'error_message' => $message,
            'started_at' => $timing?->started_at,
            'completed_at' => $timing?->completed_at,
        ];
    }

    private function requestLatency(?Response $response, ?object $timing): int
    {
        $handlerStats = $timing?->handler_stats ?? ($response?->handlerStats() ?? []);
        $totalTime = $handlerStats['total_time'] ?? null;
        if (is_numeric($totalTime) && (float) $totalTime > 0) {
            return max(1, (int) round((float) $totalTime * 1000));
        }

        if (is_numeric($timing?->transfer_time) && (float) $timing->transfer_time > 0) {
            return max(1, (int) round((float) $timing->transfer_time * 1000));
        }

        if (is_int($timing?->started_at_ns) && is_int($timing?->completed_at_ns)) {
            return max(1, (int) round(($timing->completed_at_ns - $timing->started_at_ns) / 1_000_000));
        }

        return is_int($timing?->started_at_ns) ? 1 : 0;
    }

    private function completeTiming(?object $timing): void
    {
        if (! is_int($timing?->started_at_ns)) {
            return;
        }

        $timing->completed_at_ns ??= hrtime(true);
        $timing->completed_at ??= CarbonImmutable::now();
    }

    private function newTiming(): object
    {
        return (object) [
            'started_at_ns' => null,
            'completed_at_ns' => null,
            'started_at' => null,
            'completed_at' => null,
            'handler_stats' => [],
            'transfer_time' => null,
            'transfer_started' => false,
        ];
    }

    private function startTiming(object $timing): void
    {
        $timing->started_at_ns = hrtime(true);
        $timing->started_at = CarbonImmutable::now();
    }

    private static function startTransferTiming(object $timing): void
    {
        if ($timing->transfer_started === true) {
            return;
        }

        $timing->transfer_started = true;
        $timing->started_at_ns = hrtime(true);
        $timing->completed_at_ns = null;
        $timing->started_at = CarbonImmutable::now();
        $timing->completed_at = null;
    }
}
