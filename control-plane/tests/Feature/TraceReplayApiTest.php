<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TraceReplayApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_trace_events_are_normalized_for_replay(): void
    {
        $response = $this->postJson('/api/traces/replay', [
            'run_id' => 'demo-run-1',
            'events' => [
                ['type' => 'llm_mutation', 'action' => 'SPAWN_NODE', 'node_id' => 'n1'],
                ['type' => 'validation_accepted', 'node_id' => 'n1'],
                ['type' => 'dag_node_added', 'node_id' => 'n1'],
                ['type' => 'validation_rejected', 'node_id' => 'ghost_node_88', 'field' => 'mutations[1].node_id'],
                ['type' => 'execution_skipped', 'node_id' => 'ghost_node_88'],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('run_id', 'demo-run-1')
            ->assertJsonPath('controls.0', 'play')
            ->assertJsonPath('controls.1', 'pause')
            ->assertJsonPath('speeds.0', '0.5x')
            ->assertJsonPath('steps.0.label', 'LLM proposed SPAWN_NODE n1')
            ->assertJsonPath('steps.3.kind', 'fault')
            ->assertJsonPath('steps.3.label', 'Validator rejected ghost_node_88')
            ->assertJsonPath('filters.0', 'faults')
            ->assertJsonCount(5, 'steps');
    }

    public function test_trace_replay_requires_events(): void
    {
        $response = $this->postJson('/api/traces/replay', [
            'run_id' => 'empty-run',
            'events' => [],
        ]);

        $response->assertUnprocessable();
    }

    public function test_trace_replay_rejects_associative_events(): void
    {
        $response = $this->postJson('/api/traces/replay', [
            'run_id' => 'bad-run',
            'events' => [
                'first' => ['type' => 'llm_mutation', 'node_id' => 'n1'],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['events']);
    }

    public function test_trace_replay_redacts_sensitive_event_payload_fields(): void
    {
        $response = $this->postJson('/api/traces/replay', [
            'run_id' => 'sensitive-run',
            'events' => [
                [
                    'type' => 'worker.output',
                    'node_id' => 'http_call',
                    'payload' => [
                        'password' => 'plain-secret',
                        'nested' => [
                            'provider_token' => 'token-value',
                            'safe' => 'visible',
                        ],
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('steps.0.event.payload.password', '[redacted]')
            ->assertJsonPath('steps.0.event.payload.nested.provider_token', '[redacted]')
            ->assertJsonPath('steps.0.event.payload.nested.safe', 'visible');
    }

    public function test_persisted_run_events_are_replayed_without_mutating_the_run(): void
    {
        $run = TalosRun::query()->create([
            'mode' => 'avm_on',
            'status' => 'blocked',
            'prompt_hash' => hash('sha256', 'persisted replay'),
        ]);

        $run->events()->create([
            'sequence' => 1,
            'event_type' => 'node.status_changed',
            'node_id' => 'extract_file',
            'severity' => 'info',
            'payload' => ['status' => 'RUNNING'],
            'occurred_at' => now(),
        ]);
        $run->events()->create([
            'sequence' => 2,
            'event_type' => 'node.status_changed',
            'node_id' => 'extract_file',
            'severity' => 'error',
            'payload' => ['status' => 'FAILED'],
            'occurred_at' => now(),
        ]);

        $this->getJson("/api/talos/runs/{$run->id}/replay")
            ->assertOk()
            ->assertJsonPath('run_id', $run->id)
            ->assertJsonPath('steps.0.sequence', 1)
            ->assertJsonPath('steps.0.status_after', 'RUNNING')
            ->assertJsonPath('steps.0.node_statuses.extract_file', 'RUNNING')
            ->assertJsonPath('steps.1.sequence', 2)
            ->assertJsonPath('steps.1.kind', 'fault')
            ->assertJsonPath('steps.1.status_after', 'FAILED')
            ->assertJsonPath('final_node_statuses.extract_file', 'FAILED');

        $this->assertDatabaseCount('talos_run_events', 2);
        $this->assertSame('blocked', $run->refresh()->status);
    }
}
