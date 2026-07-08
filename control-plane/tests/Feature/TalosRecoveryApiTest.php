<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosRecoveryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_recovery_action_is_rejected(): void
    {
        $run = $this->createBlockedRun();

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'self_heal_everything',
            'node_id' => 'extract_file',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['action']);
    }

    public function test_retry_node_creates_audit_and_status_events(): void
    {
        $run = $this->createBlockedRun();

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'retry_node',
            'node_id' => 'extract_file',
            'reason' => 'Operator uploaded corrected payload.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.run.status', 'queued')
            ->assertJsonPath('data.events.0.sequence', 1)
            ->assertJsonPath('data.events.0.event_type', 'recovery.requested')
            ->assertJsonPath('data.events.0.node_id', 'extract_file')
            ->assertJsonPath('data.events.0.payload.action', 'retry_node')
            ->assertJsonPath('data.events.1.sequence', 2)
            ->assertJsonPath('data.events.1.event_type', 'node.status_changed')
            ->assertJsonPath('data.events.1.payload.status', 'RETRYING');

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $run->id,
            'sequence' => 1,
            'event_type' => 'recovery.requested',
            'node_id' => 'extract_file',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $run->id,
            'sequence' => 2,
            'event_type' => 'node.status_changed',
            'node_id' => 'extract_file',
        ]);
    }

    public function test_high_risk_recovery_requires_capability(): void
    {
        $run = $this->createBlockedRun();

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'skip_node',
            'node_id' => 'extract_file',
            'reason' => 'Operator accepts missing branch.',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['capabilities']);

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'skip_node',
            'node_id' => 'extract_file',
            'reason' => 'Operator accepts missing branch.',
            'capabilities' => ['talos.recovery.high_risk'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.events.1.payload.status', 'SKIPPED');
    }

    public function test_edit_payload_recovery_redacts_sensitive_fields_in_events(): void
    {
        $run = $this->createBlockedRun();

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'edit_payload_and_retry',
            'node_id' => 'extract_file',
            'reason' => 'Operator rotated a provider credential.',
            'payload' => [
                'url' => 'https://api.example.test',
                'api_key' => 'sk-test-secret',
                'headers' => [
                    'Authorization' => 'Bearer visible-by-key-name',
                    'refresh_token' => 'refresh-token-value',
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.events.0.payload.edited_payload.api_key', '[redacted]')
            ->assertJsonPath('data.events.0.payload.edited_payload.headers.refresh_token', '[redacted]')
            ->assertJsonPath('data.events.0.payload.edited_payload.url', 'https://api.example.test');
    }

    private function createBlockedRun(): TalosRun
    {
        return TalosRun::query()->create([
            'mode' => 'avm_on',
            'status' => 'blocked',
            'prompt_hash' => hash('sha256', 'recover this run'),
            'metadata' => ['test' => true],
        ]);
    }
}
