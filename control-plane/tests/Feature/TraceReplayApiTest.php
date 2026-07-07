<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TraceReplayApiTest extends TestCase
{
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
}
