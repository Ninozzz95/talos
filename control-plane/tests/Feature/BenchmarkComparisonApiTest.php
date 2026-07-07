<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class BenchmarkComparisonApiTest extends TestCase
{
    public function test_private_benchmark_scenario_can_be_compared(): void
    {
        Storage::fake('local');

        $scenario = [
            'name' => 'uploaded_file_summary',
            'difficulty' => 2,
            'description' => 'Generated from uploaded file',
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
        ];

        Storage::disk('local')->put('benchmark-scenarios/test/uploaded_file_summary.json', json_encode($scenario));

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/test/uploaded_file_summary.json',
            'runs' => 1,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('report_type', 'benchmark_evidence')
            ->assertJsonPath('evidence_summary.winner', 'avm_on')
            ->assertJsonPath('evidence_summary.avm_enterprise_risk_score', 0)
            ->assertJsonPath('scenario.name', 'uploaded_file_summary')
            ->assertJsonPath('modes.avm_on.state_match', true)
            ->assertJsonPath('modes.avm_on.enterprise_risk_score', 0)
            ->assertJsonPath('modes.avm_on.total_nodes', 2)
            ->assertJsonPath('modes.avm_off_direct.total_nodes', 2)
            ->assertJsonPath('modes.tool_agent.total_nodes', 2);
    }

    public function test_missing_private_benchmark_scenario_returns_not_found(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => 'benchmark-scenarios/missing.json',
        ]);

        $response
            ->assertNotFound()
            ->assertJsonPath('message', 'Benchmark scenario not found.');
    }

    public function test_path_traversal_is_rejected_before_storage_access(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/benchmarks/compare', [
            'scenario_path' => '../core/tests/benchmarks/scenarios/01_simple_http.json',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The scenario path must be a private benchmark scenario path.');
    }
}
