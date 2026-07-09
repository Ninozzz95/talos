<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBenchmarkGroup;
use App\Models\TalosBenchmarkResult;
use App\Models\TalosAuditEvent;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class BenchmarkComparisonApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_private_benchmark_scenario_can_be_compared(): void
    {
        $this->useIsolatedLocalStorage();

        $scenario = [
            'name' => 'uploaded_file_summary',
            'difficulty' => 2,
            'description' => 'Generated from uploaded file',
            'input_files' => [[
                'name' => 'workflow.md',
                'sha256' => hash('sha256', 'workflow file'),
            ]],
            'task' => 'Read workflow.md and extract the operational actions using only file facts.',
            'steps' => [
                ['cycle' => 1, 'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'read_file', 'node_type' => 'READ_FILE'],
                    ['action' => 'SPAWN_NODE', 'node_id' => 'extract', 'node_type' => 'EXTRACT_FIELDS', 'dependencies' => ['read_file']],
                ]],
                ['cycle' => 2, 'mutations' => [
                    ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'read_file', 'payload' => ['storage_path' => 'ingested/test.md']],
                    ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'extract', 'payload' => ['fields' => ['summary', 'actions']]],
                    ['action' => 'YIELD_EXECUTION'],
                ]],
            ],
            'inject_error_at' => null,
            'expected_nodes' => 2,
            'expected_all_success' => true,
            'expected' => ['grounding' => 'uploaded_file_only'],
            'evidence_contract' => ['source_integrity' => 'sha256_match_required'],
        ];

        $scenarioJson = (string) json_encode($scenario);
        Storage::disk('local')->put('benchmark-scenarios/test/uploaded_file_summary.json', $scenarioJson);

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/test/uploaded_file_summary.json',
            'runs' => 1,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('report_type', 'benchmark_evidence')
            ->assertJsonPath('benchmark_group.name', 'uploaded_file_summary')
            ->assertJsonCount(3, 'benchmark_results')
            ->assertJsonPath('evidence_summary.winner', 'avm_on')
            ->assertJsonPath('evidence_summary.avm_enterprise_risk_score', 0)
            ->assertJsonPath('scenario.name', 'uploaded_file_summary')
            ->assertJsonPath('modes.avm_on.state_match', true)
            ->assertJsonPath('modes.avm_on.enterprise_risk_score', 0)
            ->assertJsonPath('modes.avm_on.total_nodes', 2)
            ->assertJsonPath('modes.avm_off_direct.total_nodes', 2)
            ->assertJsonPath('modes.tool_agent.total_nodes', 2);

        $groupId = $response->json('benchmark_group.id');
        $this->assertIsString($groupId);

        $group = TalosBenchmarkGroup::query()->findOrFail($groupId);
        $results = TalosBenchmarkResult::query()
            ->where('benchmark_group_id', $groupId)
            ->orderBy('mode')
            ->get();

        $this->assertSame('uploaded_file_summary', $group->name);
        $this->assertSame(hash('sha256', $scenarioJson), $group->scenario_hash);
        $this->assertSame(hash('sha256', $scenario['task']), $group->prompt_hash);
        $this->assertNotNull($group->context_hash);
        $this->assertSame('kadmos-core-benchmark-v1', $group->evaluator_version);
        $this->assertCount(3, $results);
        $this->assertEqualsCanonicalizing(['avm_off_direct', 'avm_on', 'tool_agent'], $results->pluck('mode')->all());
        $this->assertCount(1, $results->pluck('prompt_hash')->unique());
        $this->assertCount(1, $results->pluck('context_hash')->unique());
        $this->assertTrue($results->every(fn (TalosBenchmarkResult $result): bool => $result->evaluator_version === 'kadmos-core-benchmark-v1'));
        $this->assertTrue($results->every(fn (TalosBenchmarkResult $result): bool => is_array($result->raw_report) && $result->raw_report !== []));
        $this->assertFalse($results->firstWhere('mode', 'avm_on')?->trace_replayable);
        $this->assertSame(0, $results->firstWhere('mode', 'avm_on')?->metrics['trace_replayability']);
    }

    public function test_missing_private_benchmark_scenario_returns_not_found(): void
    {
        $this->useIsolatedLocalStorage();

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/missing.json',
        ]);

        $response
            ->assertNotFound()
            ->assertJsonPath('message', 'Benchmark scenario not found.');
    }

    public function test_path_traversal_is_rejected_before_storage_access(): void
    {
        $this->useIsolatedLocalStorage();

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => '../core/tests/benchmarks/scenarios/01_simple_http.json',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The scenario path must be a private benchmark scenario path.');
    }

    public function test_persisted_benchmark_groups_can_be_listed_and_shown(): void
    {
        $this->useIsolatedLocalStorage();

        $scenario = [
            'name' => 'listable_benchmark',
            'difficulty' => 1,
            'description' => 'List benchmark group',
            'steps' => [
                ['cycle' => 1, 'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'read_file', 'node_type' => 'READ_FILE'],
                ]],
                ['cycle' => 2, 'mutations' => [
                    ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'read_file', 'payload' => ['storage_path' => 'ingested/test.md']],
                    ['action' => 'YIELD_EXECUTION'],
                ]],
            ],
            'expected_nodes' => 1,
            'expected_all_success' => true,
        ];

        Storage::disk('local')->put('benchmark-scenarios/test/listable_benchmark.json', json_encode($scenario));

        $groupId = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/test/listable_benchmark.json',
            'runs' => 1,
        ])->json('benchmark_group.id');

        $this->getJson('/api/talos/benchmark-groups')
            ->assertOk()
            ->assertJsonPath('data.0.id', $groupId)
            ->assertJsonPath('data.0.results_count', 3);

        $this->getJson("/api/talos/benchmark-groups/{$groupId}")
            ->assertOk()
            ->assertJsonPath('data.id', $groupId)
            ->assertJsonCount(3, 'data.results');
    }

    public function test_persisted_benchmark_group_can_be_exported_with_audit_event(): void
    {
        $group = TalosBenchmarkGroup::query()->create([
            'user_id' => $this->user->id,
            'name' => 'exportable_benchmark',
            'scenario_path' => 'benchmark-scenarios/test/exportable.json',
            'scenario_hash' => hash('sha256', 'scenario'),
            'prompt_hash' => hash('sha256', 'prompt'),
            'context_hash' => hash('sha256', 'context'),
            'model' => 'gpt-test',
            'evaluator_version' => 'kadmos-core-benchmark-v1',
            'metadata' => ['source' => 'test'],
        ]);

        TalosBenchmarkResult::query()->create([
            'benchmark_group_id' => $group->id,
            'mode' => 'avm_on',
            'label' => 'AVM ON',
            'status' => 'success',
            'prompt_hash' => $group->prompt_hash,
            'context_hash' => $group->context_hash,
            'evaluator_version' => $group->evaluator_version,
            'metrics' => ['state_match' => true, 'enterprise_risk_score' => 0],
            'raw_report' => ['status' => 'success'],
            'trace_replayable' => true,
        ]);
        TalosBenchmarkResult::query()->create([
            'benchmark_group_id' => $group->id,
            'mode' => 'avm_off_direct',
            'label' => 'AVM OFF direct',
            'status' => 'completed_with_risk',
            'prompt_hash' => $group->prompt_hash,
            'context_hash' => $group->context_hash,
            'evaluator_version' => $group->evaluator_version,
            'metrics' => ['state_match' => false, 'enterprise_risk_score' => 42],
            'raw_report' => ['status' => 'completed_with_risk'],
            'trace_replayable' => false,
        ]);

        $response = $this->getJson("/api/talos/benchmark-groups/{$group->id}/export");

        $response
            ->assertOk()
            ->assertHeader('Content-Disposition')
            ->assertJsonPath('report_type', 'talos_benchmark_export')
            ->assertJsonPath('schema_version', 1)
            ->assertJsonPath('benchmark_group.id', $group->id)
            ->assertJsonPath('fairness_contract.same_prompt', $group->prompt_hash)
            ->assertJsonPath('fairness_contract.same_context', $group->context_hash)
            ->assertJsonPath('fairness_contract.same_evaluator', $group->evaluator_version)
            ->assertJsonPath('export_status', 'complete')
            ->assertJsonCount(2, 'results');

        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'benchmark_report.exported',
            'subject_type' => 'benchmark_group',
            'subject_id' => $group->id,
        ]);
    }

    public function test_incomplete_benchmark_group_export_is_rejected_without_audit_event(): void
    {
        $group = TalosBenchmarkGroup::query()->create([
            'user_id' => $this->user->id,
            'name' => 'incomplete_benchmark',
            'scenario_path' => 'benchmark-scenarios/test/incomplete.json',
            'scenario_hash' => hash('sha256', 'scenario'),
            'prompt_hash' => hash('sha256', 'prompt'),
            'context_hash' => hash('sha256', 'context'),
            'model' => 'gpt-test',
            'evaluator_version' => 'kadmos-core-benchmark-v1',
            'metadata' => ['source' => 'test'],
        ]);

        TalosBenchmarkResult::query()->create([
            'benchmark_group_id' => $group->id,
            'mode' => 'avm_on',
            'label' => 'AVM ON',
            'status' => 'success',
            'prompt_hash' => $group->prompt_hash,
            'context_hash' => $group->context_hash,
            'evaluator_version' => $group->evaluator_version,
            'metrics' => ['state_match' => true, 'enterprise_risk_score' => 0],
            'raw_report' => ['status' => 'success'],
            'trace_replayable' => true,
        ]);

        $this->getJson("/api/talos/benchmark-groups/{$group->id}/export")
            ->assertUnprocessable()
            ->assertJsonPath('error', 'BENCHMARK_EXPORT_INCOMPLETE')
            ->assertJsonPath('missing_modes.0', 'avm_off_direct');

        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'benchmark_report.exported')
            ->where('subject_id', $group->id)
            ->count());
    }

    public function test_benchmark_group_export_rejects_mismatched_fairness_hashes(): void
    {
        $group = TalosBenchmarkGroup::query()->create([
            'user_id' => $this->user->id,
            'name' => 'mismatched_benchmark',
            'scenario_path' => 'benchmark-scenarios/test/mismatched.json',
            'scenario_hash' => hash('sha256', 'scenario'),
            'prompt_hash' => hash('sha256', 'prompt'),
            'context_hash' => hash('sha256', 'context'),
            'model' => 'gpt-test',
            'evaluator_version' => 'kadmos-core-benchmark-v1',
            'metadata' => ['source' => 'test'],
        ]);

        foreach (['avm_on', 'avm_off_direct'] as $mode) {
            TalosBenchmarkResult::query()->create([
                'benchmark_group_id' => $group->id,
                'mode' => $mode,
                'label' => $mode,
                'status' => 'success',
                'prompt_hash' => $mode === 'avm_off_direct' ? hash('sha256', 'different prompt') : $group->prompt_hash,
                'context_hash' => $group->context_hash,
                'evaluator_version' => $group->evaluator_version,
                'metrics' => ['state_match' => $mode === 'avm_on', 'enterprise_risk_score' => $mode === 'avm_on' ? 0 : 42],
                'raw_report' => ['status' => 'success'],
                'trace_replayable' => $mode === 'avm_on',
            ]);
        }

        $this->getJson("/api/talos/benchmark-groups/{$group->id}/export")
            ->assertUnprocessable()
            ->assertJsonPath('error', 'BENCHMARK_EXPORT_INCOMPLETE')
            ->assertJsonPath('fairness_violations.0', 'result_prompt_hash_mismatch:avm_off_direct');
    }

    public function test_benchmark_persistence_does_not_invent_missing_prompt_or_context_hashes(): void
    {
        $this->useIsolatedLocalStorage();

        $scenario = [
            'name' => 'minimal_benchmark',
            'difficulty' => 1,
            'description' => 'No prompt or context material supplied',
            'steps' => [
                ['cycle' => 1, 'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'read_file', 'node_type' => 'READ_FILE'],
                ]],
                ['cycle' => 2, 'mutations' => [
                    ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'read_file', 'payload' => ['storage_path' => 'ingested/test.md']],
                    ['action' => 'YIELD_EXECUTION'],
                ]],
            ],
            'expected_nodes' => 1,
            'expected_all_success' => true,
        ];

        Storage::disk('local')->put('benchmark-scenarios/test/minimal_benchmark.json', json_encode($scenario));

        $groupId = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/test/minimal_benchmark.json',
            'runs' => 1,
        ])->json('benchmark_group.id');

        $group = TalosBenchmarkGroup::query()->findOrFail($groupId);
        $results = TalosBenchmarkResult::query()
            ->where('benchmark_group_id', $groupId)
            ->get();

        $this->assertNull($group->prompt_hash);
        $this->assertNull($group->context_hash);
        $this->assertTrue($results->every(fn (TalosBenchmarkResult $result): bool => $result->prompt_hash === null));
        $this->assertTrue($results->every(fn (TalosBenchmarkResult $result): bool => $result->context_hash === null));
    }

    public function test_persisted_run_can_create_a_private_benchmark_scenario_and_comparison(): void
    {
        $this->useIsolatedLocalStorage();

        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'Summarize this operational workflow.'),
            'prompt' => 'Summarize this operational workflow.',
            'provider' => 'openai',
            'model' => 'gpt-test',
        ]);

        $response = $this->postJson("/api/talos/runs/{$run->id}/benchmark", [
            'runs' => 1,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('benchmark_group.source_run_id', $run->id)
            ->assertJsonPath('benchmark_group.prompt_hash', hash('sha256', 'Summarize this operational workflow.'))
            ->assertJsonPath('benchmark_group.model', 'gpt-test')
            ->assertJsonCount(3, 'benchmark_results');

        $scenarioPath = $response->json('benchmark_group.scenario_path');
        $this->assertIsString($scenarioPath);
        $this->assertStringStartsWith('benchmark-scenarios/runs/', $scenarioPath);
        Storage::disk('local')->assertExists($scenarioPath);

        $this->assertDatabaseHas('talos_benchmark_groups', [
            'source_run_id' => $run->id,
            'prompt_hash' => hash('sha256', 'Summarize this operational workflow.'),
        ]);
    }

    public function test_run_benchmark_requires_a_persisted_prompt(): void
    {
        $this->useIsolatedLocalStorage();

        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'missing prompt'),
        ]);

        $this->postJson("/api/talos/runs/{$run->id}/benchmark", [
            'runs' => 1,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run']);
    }

    public function test_benchmark_groups_exports_and_run_benchmark_are_scoped_to_the_authenticated_user(): void
    {
        $foreignSession = TalosSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Foreign benchmark session',
            'mode' => 'avm_on',
        ]);
        $foreignRun = TalosRun::query()->create([
            'session_id' => $foreignSession->id,
            'mode' => 'avm_on',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'foreign benchmark prompt'),
            'prompt' => 'Foreign benchmark prompt',
            'provider' => 'openai',
            'model' => 'gpt-test',
        ]);
        $foreignGroup = TalosBenchmarkGroup::query()->create([
            'session_id' => $foreignSession->id,
            'source_run_id' => $foreignRun->id,
            'name' => 'foreign benchmark',
            'scenario_path' => 'benchmark-scenarios/test/foreign.json',
            'scenario_hash' => hash('sha256', 'foreign scenario'),
            'prompt_hash' => hash('sha256', 'foreign prompt'),
            'context_hash' => hash('sha256', 'foreign context'),
            'model' => 'gpt-test',
            'evaluator_version' => 'kadmos-core-benchmark-v1',
        ]);

        $this->getJson('/api/talos/benchmark-groups')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignGroup->id]);

        $this->getJson("/api/talos/benchmark-groups/{$foreignGroup->id}")->assertNotFound();
        $this->getJson("/api/talos/benchmark-groups/{$foreignGroup->id}/export")->assertNotFound();
        $this->postJson("/api/talos/runs/{$foreignRun->id}/benchmark", ['runs' => 1])->assertNotFound();

        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'benchmark_report.exported')
            ->where('subject_id', $foreignGroup->id)
            ->count());
    }
}
