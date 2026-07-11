<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBenchmarkGroup;
use App\Models\TalosBenchmarkResult;
use App\Models\TalosModelComparisonLane;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\User;
use App\Services\Models\TalosModelComparisonService;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosModelComparisonApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $allowedHosts = [
            'api.openai.com',
            'api.deepseek.com',
            'api.anthropic.com',
            'generativelanguage.googleapis.com',
            'openrouter.ai',
            'ollama.example',
        ];
        config(['services.talos.model_provider_allowed_hosts' => $allowedHosts]);
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            $allowedHosts,
            static fn (string $host): array => ['93.184.216.34'],
        );
        $this->app->instance(PublicHttpUrlPolicy::class, $policy);
        $this->app->instance(PublicHttpRequestPinning::class, $this->relaxedPinning($policy));
        $this->app->bind(
            TalosModelComparisonService::class,
            fn ($app) => new TalosModelComparisonService(
                $app->make(PublicHttpUrlPolicy::class),
                $app->make(PublicHttpRequestPinning::class),
            ),
        );
        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/messages')) {
                return Http::response([
                    'content' => [
                        ['type' => 'text', 'text' => 'First paragraph.'],
                        ['type' => 'tool_use', 'id' => 'tool-1'],
                        ['type' => 'text', 'text' => 'Second paragraph.'],
                    ],
                    'usage' => ['input_tokens' => 4, 'output_tokens' => 6],
                ]);
            }

            if ($request['model'] === 'gpt-redirect') {
                return Http::response(null, 302, ['Location' => 'https://attacker.example/collect']);
            }

            return $request['model'] === 'gpt-failed'
                ? Http::response(['error' => ['message' => 'quota exceeded']], 429)
                : Http::response([
                    'choices' => [['message' => ['content' => 'Provider answer for '.(string) $request['model']]]],
                    'usage' => ['prompt_tokens' => 12, 'completion_tokens' => 7, 'total_tokens' => 19, 'cost' => 0.0042],
                ]);
        });
    }

    public function test_blind_model_comparison_creates_redacted_lanes_and_runs(): void
    {
        $alpha = $this->profile('OpenAI Alpha', 'gpt-alpha');
        $beta = $this->profile('Anthropic Beta', 'claude-beta');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Compare recovery options for a blocked DAG.',
            'mode' => 'blind',
            'task_type' => 'chat',
            'blind' => false,
            'timeout_seconds' => 45,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'blind')
            ->assertJsonPath('data.blind', true)
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.lanes.0.display_alias', 'Model A')
            ->assertJsonPath('data.lanes.1.display_alias', 'Model B')
            ->assertJsonMissingPath('data.lanes.0.run_id')
            ->assertJsonMissingPath('data.lanes.1.run_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile')
            ->assertJsonMissingPath('data.lanes.1.model_profile_id')
            ->assertJsonMissing(['OpenAI Alpha', 'Anthropic Beta']);

        $comparisonId = $response->json('data.id');
        $this->assertIsString($comparisonId);

        $this->assertDatabaseHas('talos_model_comparisons', [
            'id' => $comparisonId,
            'user_id' => $this->user->id,
            'status' => 'completed',
            'blind' => true,
        ]);

        $laneProfileIds = TalosModelComparisonLane::query()
            ->where('comparison_id', $comparisonId)
            ->orderBy('position')
            ->pluck('model_profile_id')
            ->all();

        $this->assertNotSame([$alpha->id, $beta->id], $laneProfileIds);
        $this->assertEqualsCanonicalizing([$alpha->id, $beta->id], $laneProfileIds);

        $this->assertDatabaseHas('talos_runs', [
            'model_profile_id' => $alpha->id,
            'mode' => 'model_comparison_lane',
            'status' => 'succeeded',
        ]);
    }

    public function test_model_comparison_rejects_disabled_missing_secret_or_cross_user_profiles(): void
    {
        $healthy = $this->profile('Healthy', 'gpt-ok');
        $disabled = $this->profile('Disabled', 'gpt-disabled', status: 'disabled');
        $failed = $this->profile('Failed', 'gpt-failed', status: 'failed');
        $missingSecret = $this->profile('No Secret', 'gpt-empty', secret: null);
        $otherUser = $this->profile('Other User', 'gpt-other', user: User::factory()->create());

        foreach ([[$healthy->id, $disabled->id], [$healthy->id, $failed->id], [$healthy->id, $missingSecret->id], [$healthy->id, $otherUser->id]] as $ids) {
            $this->postJson('/api/talos/model-comparisons', [
                'prompt' => 'This should be rejected.',
                'model_profile_ids' => $ids,
            ])->assertUnprocessable();
        }
    }

    public function test_model_comparison_rejects_a_healthy_label_without_successful_probe_evidence(): void
    {
        $verified = $this->profile('Verified', 'gpt-verified');
        $unverified = $this->profile('Unverified', 'gpt-unverified');
        $unverified->update(['probe_result' => null]);

        $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Do not trust a client status label.',
            'model_profile_ids' => [$verified->id, $unverified->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['model_profile_ids']);
    }

    public function test_model_comparison_calls_provider_and_records_real_response_usage_and_cost(): void
    {
        $alpha = $this->profile('OpenAI Alpha', 'gpt-alpha');
        $beta = $this->profile('OpenAI Beta', 'gpt-beta');

        $created = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Use provider evidence.',
            'mode' => 'parallel',
            'blind' => false,
            'timeout_seconds' => 17,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated()->assertJsonPath('data.lanes.0.response_text', 'Provider answer for gpt-alpha');

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://api.openai.com/v1/chat/completions'
            && $request['model'] === 'gpt-alpha'
            && $request['messages'][0]['content'] === 'Use provider evidence.'
            && $request->hasHeader('Authorization', 'Bearer secret'));

        $laneId = $created->json('data.lanes.0.id');
        $this->assertDatabaseHas('talos_model_comparison_lanes', [
            'id' => $laneId,
            'response_text' => 'Provider answer for gpt-alpha',
            'cost' => 0.0042,
            'status' => 'completed',
        ]);
        $lane = TalosModelComparisonLane::query()->findOrFail($laneId);
        $this->assertGreaterThanOrEqual(0, $lane->latency_ms);
        $this->assertSame(19, $lane->metadata['usage']['total_tokens']);
        $this->assertSame('provider_http', $lane->metadata['evidence_source']);
    }

    public function test_comparison_records_nonzero_timing_and_per_lane_runs(): void
    {
        Http::fake(function (Request $request) {
            if ($request['model'] === 'gpt-slow') {
                usleep(70_000);
            } else {
                usleep(5_000);
            }

            return Http::response([
                'choices' => [['message' => ['content' => 'Provider answer for '.(string) $request['model']]]],
            ]);
        });

        $slow = $this->profile('Slow', 'gpt-slow');
        $fast = $this->profile('Fast', 'gpt-fast');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Measure request duration.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$slow->id, $fast->id],
        ])->assertCreated();

        $slowLatency = $response->json('data.lanes.0.latency_ms');
        $fastLatency = $response->json('data.lanes.1.latency_ms');

        $this->assertIsInt($slowLatency);
        $this->assertIsInt($fastLatency);
        $this->assertGreaterThan(0, $slowLatency);
        $this->assertGreaterThan(0, $fastLatency);

        $lanes = TalosModelComparisonLane::query()->orderBy('position')->get();
        foreach ($lanes as $lane) {
            $run = TalosRun::query()->findOrFail($lane->run_id);
            $this->assertNotNull($run->started_at);
            $this->assertNotNull($run->completed_at);
            $this->assertTrue($run->completed_at->greaterThanOrEqualTo($run->started_at));
            $this->assertGreaterThan(0, $lane->latency_ms);
        }
    }

    public function test_policy_and_decrypt_preflight_failures_have_lane_specific_nonzero_timing(): void
    {
        Http::fake();
        $policyBlocked = $this->profile(
            'Policy blocked',
            'gpt-policy-blocked',
            baseUrl: 'https://public-but-unlisted.example/v1',
        );
        $policyBlocked->forceFill(['encrypted_secret' => 'malformed-policy-ciphertext'])->save();
        $decryptFailed = $this->profile('Decrypt failed', 'gpt-decrypt-failed');
        $decryptFailed->forceFill(['encrypted_secret' => 'malformed-decrypt-ciphertext'])->save();

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Measure each failed preflight lane.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$policyBlocked->id, $decryptFailed->id],
        ])->assertCreated()->assertJsonPath('data.status', 'completed_with_errors');

        $this->assertSame('BASE_URL_POLICY_BLOCKED', $response->json('data.lanes.0.error_code'));
        $this->assertSame('PROVIDER_SECRET_DECRYPT_FAILED', $response->json('data.lanes.1.error_code'));
        $this->assertLaneTimingWasRecorded($policyBlocked);
        $this->assertLaneTimingWasRecorded($decryptFailed);
        Http::assertNothingSent();
    }

    public function test_connection_pinning_preflight_failures_have_lane_specific_nonzero_timing(): void
    {
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            ['api.openai.com'],
            static fn (string $host): array => ['93.184.216.34'],
        );
        $pinning = new PublicHttpRequestPinning($policy, curlResolveAvailable: false);
        $this->app->instance(PublicHttpUrlPolicy::class, $policy);
        $this->app->instance(PublicHttpRequestPinning::class, $pinning);
        $this->app->bind(TalosModelComparisonService::class, fn () => new TalosModelComparisonService($policy, $pinning));
        Http::fake();

        $alpha = $this->profile('Unpinnable Alpha', 'gpt-unpinnable-a');
        $beta = $this->profile('Unpinnable Beta', 'gpt-unpinnable-b');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Fail before provider transfer.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated()->assertJsonPath('data.status', 'completed_with_errors');

        $this->assertSame('CONNECTION_PINNING_UNAVAILABLE', $response->json('data.lanes.0.error_code'));
        $this->assertSame('CONNECTION_PINNING_UNAVAILABLE', $response->json('data.lanes.1.error_code'));
        $this->assertLaneTimingWasRecorded($alpha);
        $this->assertLaneTimingWasRecorded($beta);
        Http::assertNothingSent();
    }

    public function test_comparison_turns_a_provider_redirect_into_a_controlled_failed_lane(): void
    {
        $redirect = $this->profile('Redirecting provider', 'gpt-redirect');
        $healthy = $this->profile('Healthy provider', 'gpt-healthy');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Reject redirects carrying credentials.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$redirect->id, $healthy->id],
        ])->assertCreated();

        $response
            ->assertJsonPath('data.status', 'completed_with_errors')
            ->assertJsonPath('data.lanes.0.error_code', 'PROVIDER_REDIRECT_BLOCKED')
            ->assertJsonPath('data.lanes.0.status', 'failed');

        $lane = TalosModelComparisonLane::query()
            ->where('model_profile_id', $redirect->id)
            ->firstOrFail();
        $run = TalosRun::query()->findOrFail($lane->run_id);
        $this->assertGreaterThan(0, $lane->latency_ms);
        $this->assertNotNull($run->started_at);
        $this->assertNotNull($run->completed_at);
    }

    public function test_two_probed_local_profiles_without_secrets_are_called_without_bearer_auth(): void
    {
        $alpha = $this->profile('Local Alpha', 'llama-a', secret: null, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1');
        $beta = $this->profile('Local Beta', 'llama-b', secret: null, provider: 'ollama', baseUrl: 'http://localhost:11434/v1');

        $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Compare locally.',
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated()->assertJsonPath('data.status', 'completed');

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '11434/v1/chat/completions')
            && ! $request->hasHeader('Authorization'));
    }

    public function test_comparison_rejects_remote_ollama_even_when_public_host_is_allowlisted(): void
    {
        Http::fake();
        $alpha = $this->profile('Remote Ollama A', 'llama-a', secret: null, provider: 'ollama', baseUrl: 'https://ollama.example/v1');
        $beta = $this->profile('Remote Ollama B', 'llama-b', secret: null, provider: 'ollama', baseUrl: 'https://ollama.example/v1');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Reject remote Ollama.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated()->assertJsonPath('data.status', 'completed_with_errors');

        $this->assertSame('BASE_URL_POLICY_BLOCKED', $response->json('data.lanes.0.error_code'));
        $this->assertSame('BASE_URL_POLICY_BLOCKED', $response->json('data.lanes.1.error_code'));
        $this->assertLaneTimingWasRecorded($alpha);
        $this->assertLaneTimingWasRecorded($beta);
        Http::assertNothingSent();
    }

    public function test_comparison_blocks_rebound_private_and_unresolved_hosts_without_sending_requests(): void
    {
        $resolutions = [
            'rebound.example' => ['10.0.0.8'],
            'legacy.example' => [],
        ];
        $this->app->instance(PublicHttpUrlPolicy::class, PublicHttpUrlPolicy::forProviderHosts(
            array_keys($resolutions),
            fn (string $host): array => $resolutions[$host] ?? ['93.184.216.34'],
        ));
        $this->app->instance(PublicHttpRequestPinning::class, $this->relaxedPinning(
            $this->app->make(PublicHttpUrlPolicy::class),
        ));
        $this->app->bind(TalosModelComparisonService::class, fn ($app) => new TalosModelComparisonService(
            $app->make(PublicHttpUrlPolicy::class),
            $app->make(PublicHttpRequestPinning::class),
        ));

        foreach (['https://rebound.example/v1', 'https://legacy.example/v1'] as $baseUrl) {
            Http::fake();
            $alpha = $this->profile('Blocked Alpha', 'gpt-blocked-a', baseUrl: $baseUrl);
            $beta = $this->profile('Blocked Beta', 'gpt-blocked-b', baseUrl: $baseUrl);

            $response = $this->postJson('/api/talos/model-comparisons', [
                'prompt' => 'Do not send credentials.',
                'mode' => 'parallel',
                'blind' => false,
                'model_profile_ids' => [$alpha->id, $beta->id],
            ])->assertCreated()->assertJsonPath('data.status', 'completed_with_errors');

            $this->assertSame('BASE_URL_POLICY_BLOCKED', $response->json('data.lanes.0.error_code'));
            $this->assertSame('BASE_URL_POLICY_BLOCKED', $response->json('data.lanes.1.error_code'));
            Http::assertNothingSent();
        }
    }

    public function test_anthropic_uses_messages_contract_and_aggregates_all_text_blocks(): void
    {
        $alpha = $this->profile('Claude Alpha', 'claude-a', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1');
        $beta = $this->profile('Claude Beta', 'claude-b', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Use Anthropic.',
            'mode' => 'parallel',
            'blind' => false,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated();

        $this->assertSame(
            "First paragraph.\nSecond paragraph.",
            $response->json('data.lanes.0.response_text'),
            (string) $response->getContent(),
        );
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://api.anthropic.com/v1/messages'
            && $request->hasHeader('x-api-key', 'secret')
            && $request->hasHeader('anthropic-version', '2023-06-01')
            && $request['max_tokens'] === 1024);
    }

    public function test_provider_http_calls_do_not_hold_a_database_transaction_open(): void
    {
        $baselineTransactionLevel = DB::transactionLevel();
        $transactionLevels = [];
        Http::fake(function (Request $request) use (&$transactionLevels) {
            $transactionLevels[] = DB::transactionLevel();

            return Http::response([
                'choices' => [['message' => ['content' => 'Provider answer for '.(string) $request['model']]]],
                'usage' => ['total_tokens' => 9],
            ]);
        });

        $alpha = $this->profile('Transaction Alpha', 'gpt-transaction-a');
        $beta = $this->profile('Transaction Beta', 'gpt-transaction-b');

        $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Keep provider I/O outside database transactions.',
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated();

        $this->assertSame(
            [$baselineTransactionLevel, $baselineTransactionLevel],
            $transactionLevels,
        );
    }

    public function test_vote_reveals_model_identities_without_leaking_before_vote(): void
    {
        $alpha = $this->profile('OpenAI Alpha', 'gpt-alpha');
        $beta = $this->profile('Anthropic Beta', 'claude-beta');

        $created = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Choose the clearest recovery answer.',
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated();

        $comparisonId = $created->json('data.id');
        $laneId = $created->json('data.lanes.0.id');
        $this->assertIsString($comparisonId);
        $this->assertIsString($laneId);

        $this->getJson("/api/talos/model-comparisons/{$comparisonId}")
            ->assertOk()
            ->assertJsonMissingPath('data.lanes.0.run_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile_id')
            ->assertJsonMissing(['OpenAI Alpha', 'Anthropic Beta']);

        $voted = $this->postJson("/api/talos/model-comparisons/{$comparisonId}/vote", [
            'lane_id' => $laneId,
            'scorecard' => [
                'usefulness' => 5,
                'correctness' => 4,
                'evidence' => 4,
                'formatting' => 5,
                'speed' => 3,
                'cost' => 4,
            ],
            'reason' => 'Best evidence structure.',
        ]);

        $voted
            ->assertOk()
            ->assertJsonPath('data.winner_lane_id', $laneId)
            ->assertJsonPath('data.revealed', true)
            ->assertJsonStructure(['data' => ['lanes' => [['run_id', 'model_profile_id', 'model_profile']]]]);

        $this->postJson("/api/talos/model-comparisons/{$comparisonId}/vote", [
            'lane_id' => $laneId,
            'reason' => 'Second vote.',
        ])->assertStatus(409);
    }

    public function test_failed_promoted_model_lane_blocks_export_with_honest_not_ready_diagnostics(): void
    {
        $success = $this->profile('Success Model', 'gpt-success');
        $failed = $this->profile('Failed Model', 'gpt-failed');
        $created = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Generate a source-backed answer.',
            'mode' => 'parallel',
            'task_type' => 'research',
            'blind' => false,
            'model_profile_ids' => [$success->id, $failed->id],
        ]);

        $created
            ->assertCreated()
            ->assertJsonPath('data.status', 'completed_with_errors')
            ->assertJsonPath('data.lanes.0.status', 'completed')
            ->assertJsonPath('data.lanes.1.status', 'failed')
            ->assertJsonPath('data.lanes.1.error_code', 'PROVIDER_HTTP_ERROR');

        $comparisonId = $created->json('data.id');
        $this->assertIsString($comparisonId);

        $promoted = $this->postJson("/api/talos/model-comparisons/{$comparisonId}/benchmark");

        $promoted
            ->assertCreated()
            ->assertJsonPath('data.metadata.comparison_type', 'model_profile_blind_compare')
            ->assertJsonPath('data.results.0.mode', 'model_lane_a')
            ->assertJsonPath('data.results.1.mode', 'model_lane_b');

        $groupId = $promoted->json('data.id');
        $this->assertIsString($groupId);

        $this->assertDatabaseHas('talos_benchmark_groups', [
            'id' => $groupId,
            'source_run_id' => $created->json('data.lanes.0.run_id'),
        ]);

        $this->getJson("/api/talos/benchmark-groups/{$groupId}/export")
            ->assertUnprocessable()
            ->assertJsonPath('error', 'BENCHMARK_EXPORT_INCOMPLETE')
            ->assertJsonPath('export_status', 'not_ready')
            ->assertJsonPath('failed_modes.0', 'model_lane_b')
            ->assertJsonMissingPath('export_status.complete');

        $this->postJson("/api/talos/model-comparisons/{$comparisonId}/benchmark")
            ->assertCreated()
            ->assertJsonPath('data.id', $groupId);
    }

    public function test_failed_avm_required_lane_blocks_export_with_failed_mode_diagnostics(): void
    {
        $hashes = [
            'prompt' => hash('sha256', 'prompt'),
            'context' => hash('sha256', 'context'),
            'evaluator' => 'kadmos-core-benchmark-v1',
        ];
        $group = TalosBenchmarkGroup::query()->create([
            'user_id' => $this->user->id,
            'name' => 'Failed AVM lane',
            'scenario_path' => 'C:\\workspace\\scenario.json',
            'scenario_hash' => hash('sha256', 'scenario'),
            'prompt_hash' => $hashes['prompt'],
            'context_hash' => $hashes['context'],
            'model' => 'gpt-test',
            'evaluator_version' => $hashes['evaluator'],
        ]);

        foreach (['avm_on' => 'failed', 'avm_off_direct' => 'completed'] as $mode => $status) {
            TalosBenchmarkResult::query()->create([
                'benchmark_group_id' => $group->id,
                'mode' => $mode,
                'label' => $mode,
                'status' => $status,
                'prompt_hash' => $hashes['prompt'],
                'context_hash' => $hashes['context'],
                'evaluator_version' => $hashes['evaluator'],
                'metrics' => [],
                'raw_report' => ['status' => $status],
            ]);
        }

        $this->getJson("/api/talos/benchmark-groups/{$group->id}/export")
            ->assertUnprocessable()
            ->assertJsonPath('export_status', 'not_ready')
            ->assertJsonPath('failed_modes.0', 'avm_on');
    }

    public function test_benchmark_group_reads_and_exports_redact_nested_paths_but_preserve_refs_and_urls(): void
    {
        $hashes = [
            'prompt' => hash('sha256', 'prompt'),
            'context' => hash('sha256', 'context'),
            'evaluator' => 'talos-model-comparison-v1',
        ];
        $group = TalosBenchmarkGroup::query()->create([
            'user_id' => $this->user->id,
            'name' => 'Redacted comparison',
            'scenario_path' => 'C:\\workspace\\scenario.json',
            'scenario_hash' => hash('sha256', 'scenario'),
            'prompt_hash' => $hashes['prompt'],
            'context_hash' => $hashes['context'],
            'model' => 'model-comparison',
            'evaluator_version' => $hashes['evaluator'],
            'metadata' => [
                'comparison_type' => 'model_profile_blind_compare',
                'scenario_ref' => 'talos://model-comparisons/example',
                'nested' => [
                    'path' => '/var/lib/talos/metadata.json',
                    'url' => 'https://example.test/evidence',
                ],
            ],
        ]);

        foreach (['model_lane_a', 'model_lane_b'] as $mode) {
            TalosBenchmarkResult::query()->create([
                'benchmark_group_id' => $group->id,
                'mode' => $mode,
                'label' => $mode,
                'status' => 'complete',
                'prompt_hash' => $hashes['prompt'],
                'context_hash' => $hashes['context'],
                'evaluator_version' => $hashes['evaluator'],
                'metrics' => [],
                'raw_log_path' => 'C:\\workspace\\raw.log',
                'raw_report' => [
                    'path' => '/var/lib/talos/raw-report.json',
                    'results' => [
                        [
                            'storage_path' => '/var/lib/talos/result.json',
                            'absolute_value' => 'C:\\workspace\\nested.json',
                            'unc_value' => '//server/share/private-artifact.json',
                            'scenario_ref' => 'talos://model-comparisons/example',
                            'url' => 'https://example.test/result',
                        ],
                    ],
                ],
            ]);
        }

        $index = $this->getJson('/api/talos/benchmark-groups')->assertOk()->json('data');
        $this->assertArrayNotHasKey('scenario_path', $index[0]);
        $this->assertSame('talos://model-comparisons/example', $index[0]['scenario_ref']);
        $this->assertArrayNotHasKey('path', $index[0]['metadata']['nested']);
        $this->assertSame('https://example.test/evidence', $index[0]['metadata']['nested']['url']);

        $show = $this->getJson("/api/talos/benchmark-groups/{$group->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('scenario_path', $show);
        $this->assertArrayNotHasKey('raw_log_path', $show['results'][0]);
        $this->assertArrayNotHasKey('path', $show['results'][0]['raw_report']);
        $this->assertArrayNotHasKey('storage_path', $show['results'][0]['raw_report']['results'][0]);
        $this->assertArrayNotHasKey('absolute_value', $show['results'][0]['raw_report']['results'][0]);
        $this->assertArrayNotHasKey('unc_value', $show['results'][0]['raw_report']['results'][0]);
        $this->assertSame('talos://model-comparisons/example', $show['results'][0]['raw_report']['results'][0]['scenario_ref']);
        $this->assertSame('https://example.test/result', $show['results'][0]['raw_report']['results'][0]['url']);

        $export = $this->getJson("/api/talos/benchmark-groups/{$group->id}/export")
            ->assertOk()
            ->json();
        $this->assertArrayNotHasKey('raw_log_path', $export['results'][0]);
        $this->assertArrayNotHasKey('path', $export['results'][0]['raw_report']);
        $this->assertArrayNotHasKey('storage_path', $export['results'][0]['raw_report']['results'][0]);
        $this->assertArrayNotHasKey('unc_value', $export['results'][0]['raw_report']['results'][0]);
        $this->assertSame('talos://model-comparisons/example', $export['results'][0]['raw_report']['results'][0]['scenario_ref']);
    }

    private function profile(string $displayName, string $model, string $status = 'healthy', ?string $secret = 'secret', ?User $user = null, string $provider = 'openai', string $baseUrl = 'https://api.openai.com/v1'): TalosModelProfile
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => ($user ?? $this->user)->id,
            'provider' => $provider,
            'model' => $model,
            'display_name' => $displayName,
            'encrypted_secret' => $secret !== null ? Crypt::encryptString($secret) : null,
            'base_url' => $baseUrl,
            'timeout_seconds' => 60,
            'status' => $status,
            'capabilities' => ['chat' => true],
            'probe_result' => ['status' => $status, 'ok' => $status === 'healthy'],
        ]);
        assert($profile instanceof TalosModelProfile);

        return $profile;
    }

    private function relaxedPinning(PublicHttpUrlPolicy $policy): PublicHttpRequestPinning
    {
        return new PublicHttpRequestPinning(
            $policy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        );
    }

    private function assertLaneTimingWasRecorded(TalosModelProfile $profile): void
    {
        $lane = TalosModelComparisonLane::query()
            ->where('model_profile_id', $profile->id)
            ->firstOrFail();
        $run = TalosRun::query()->findOrFail($lane->run_id);

        $this->assertGreaterThanOrEqual(1, $lane->latency_ms);
        $this->assertNotNull($run->started_at);
        $this->assertNotNull($run->completed_at);
        $this->assertTrue($run->completed_at->greaterThanOrEqualTo($run->started_at));
    }
}
