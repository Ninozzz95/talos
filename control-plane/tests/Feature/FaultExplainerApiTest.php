<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class FaultExplainerApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_validation_fault_gets_plain_language_consequence(): void
    {
        $response = $this->postJson('/api/faults/explain', [
            'field' => 'mutations[1].node_id',
            'expected' => 'node_id present in context',
            'received' => 'ghost_node_88',
            'message' => 'Node not found in context',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('fault.field', 'mutations[1].node_id')
            ->assertJsonPath('plain_language', 'The model tried to edit a node that does not exist in the workflow.')
            ->assertJsonPath('execution_consequence', 'Kadmos rejected the mutation before execution, so no worker or external system was touched.')
            ->assertJsonPath('recovery_path', 'Create the node first, choose an existing node_id, or remove the mutation from the batch.');
    }

    public function test_payload_fault_gets_actionable_recovery(): void
    {
        $response = $this->postJson('/api/faults/explain', [
            'field' => 'mutations[0].payload.url',
            'expected' => 'valid URL',
            'received' => 'not-a-url',
            'message' => 'Invalid URL',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('plain_language', 'The model supplied a payload value that does not match the required contract.')
            ->assertJsonPath('recovery_path', 'Correct the payload field and re-run validation before execution.');
    }
}
