<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSession;
use App\Models\TalosRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosRunApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_run_can_be_created_and_events_are_appended_in_order(): void
    {
        $response = $this->postJson('/api/talos/runs', [
            'mode' => 'avm_on',
            'status' => 'queued',
            'prompt_hash' => hash('sha256', 'Create a workflow'),
            'metadata' => ['source' => 'test'],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'avm_on')
            ->assertJsonPath('data.status', 'queued');

        $runId = $response->json('data.id');
        $this->assertIsString($runId);

        $this->postJson("/api/talos/runs/{$runId}/events", [
            'events' => [
                [
                    'event_type' => 'node.status_changed',
                    'node_id' => 'read_file',
                    'severity' => 'info',
                    'payload' => ['status' => 'RUNNING'],
                ],
                [
                    'type' => 'worker.output',
                    'node_id' => 'read_file',
                    'payload' => ['summary' => 'ok'],
                ],
                [
                    'payload' => ['fallback' => true],
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.0.sequence', 1)
            ->assertJsonPath('data.0.event_type', 'node.status_changed')
            ->assertJsonPath('data.1.sequence', 2)
            ->assertJsonPath('data.1.event_type', 'worker.output')
            ->assertJsonPath('data.1.severity', 'info')
            ->assertJsonPath('data.2.sequence', 3)
            ->assertJsonPath('data.2.event_type', 'unknown.generic')
            ->assertJsonPath('data.2.node_id', null);

        $this->postJson("/api/talos/runs/{$runId}/events", [
            'events' => [
                [
                    'event_type' => 'policy.decision',
                    'severity' => 'warning',
                    'payload' => ['allowed' => false],
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.0.sequence', 4)
            ->assertJsonPath('data.0.severity', 'warning');

        $this->getJson("/api/talos/runs/{$runId}/events")
            ->assertOk()
            ->assertJsonPath('data.0.sequence', 1)
            ->assertJsonPath('data.1.sequence', 2)
            ->assertJsonPath('data.2.sequence', 3)
            ->assertJsonPath('data.3.sequence', 4);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 1,
            'event_type' => 'node.status_changed',
        ]);
    }

    public function test_run_events_reject_associative_event_payloads(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'queued',
            'prompt_hash' => hash('sha256', 'prompt'),
        ]);

        $this->postJson("/api/talos/runs/{$run->id}/events", [
            'events' => [
                'first' => ['event_type' => 'node.status_changed'],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['events']);
    }

    public function test_run_events_redact_sensitive_payload_fields_before_returning_or_storing(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'queued',
            'prompt_hash' => hash('sha256', 'prompt'),
        ]);

        $this->postJson("/api/talos/runs/{$run->id}/events", [
            'events' => [[
                'event_type' => 'worker.output',
                'node_id' => 'http_call',
                'payload' => [
                    'api_key' => 'sk-test-secret',
                    'nested' => [
                        'refresh_token' => 'token-value',
                        'safe' => 'visible',
                    ],
                ],
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.0.payload.api_key', '[redacted]')
            ->assertJsonPath('data.0.payload.nested.refresh_token', '[redacted]')
            ->assertJsonPath('data.0.payload.nested.safe', 'visible');

        $event = $run->events()->firstOrFail();
        $this->assertSame('[redacted]', $event->payload['api_key']);
        $this->assertSame('[redacted]', $event->payload['nested']['refresh_token']);

        $this->getJson("/api/talos/runs/{$run->id}/events")
            ->assertOk()
            ->assertJsonPath('data.0.payload.api_key', '[redacted]')
            ->assertJsonPath('data.0.payload.nested.refresh_token', '[redacted]');
    }

    public function test_run_events_support_a_validated_exclusive_after_sequence_cursor(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'stream cursor'),
        ]);
        foreach (range(1, 3) as $sequence) {
            $run->events()->create([
                'sequence' => $sequence,
                'event_type' => 'text.delta',
                'severity' => 'info',
                'payload' => ['index' => $sequence],
                'occurred_at' => now(),
            ]);
        }

        $this->getJson("/api/talos/runs/{$run->id}/events")
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.sequence', 1);

        $this->getJson("/api/talos/runs/{$run->id}/events?after_sequence=1")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.sequence', 2)
            ->assertJsonPath('data.1.sequence', 3);

        $this->getJson("/api/talos/runs/{$run->id}/events?after_sequence=3")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson("/api/talos/runs/{$run->id}/events?after_sequence=-1")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['after_sequence']);
        $this->getJson("/api/talos/runs/{$run->id}/events?after_sequence=one")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['after_sequence']);
    }

    public function test_run_artifact_metadata_can_be_stored(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'prompt'),
        ]);

        $this->postJson("/api/talos/runs/{$run->id}/artifacts", [
            'artifact_type' => 'evidence_report',
            'uri' => 'local://reports/run-1.json',
            'mime_type' => 'application/json',
            'metadata' => ['sha256' => hash('sha256', 'report')],
        ])
            ->assertCreated()
            ->assertJsonPath('data.artifact_type', 'evidence_report')
            ->assertJsonPath('data.uri', 'local://reports/run-1.json');

        $this->assertDatabaseHas('talos_run_artifacts', [
            'run_id' => $run->id,
            'artifact_type' => 'evidence_report',
        ]);
    }

    public function test_runs_and_nested_run_resources_are_scoped_to_the_authenticated_user(): void
    {
        $ownRun = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'avm_on',
            'status' => 'queued',
            'prompt_hash' => hash('sha256', 'own run'),
        ]);

        $foreignSession = TalosSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Foreign session',
            'mode' => 'avm_on',
        ]);
        $foreignRun = TalosRun::query()->create([
            'session_id' => $foreignSession->id,
            'mode' => 'avm_on',
            'status' => 'queued',
            'prompt_hash' => hash('sha256', 'foreign run'),
        ]);
        $foreignRun->events()->create([
            'sequence' => 1,
            'event_type' => 'worker.output',
            'severity' => 'info',
            'payload' => ['secret' => 'foreign'],
            'occurred_at' => now(),
        ]);

        $this->getJson('/api/talos/runs')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ownRun->id)
            ->assertJsonMissing(['id' => $foreignRun->id]);

        $this->getJson("/api/talos/runs/{$foreignRun->id}")->assertNotFound();
        $this->patchJson("/api/talos/runs/{$foreignRun->id}", ['status' => 'running'])->assertNotFound();
        $this->getJson("/api/talos/runs/{$foreignRun->id}/events")->assertNotFound();
        $this->postJson("/api/talos/runs/{$foreignRun->id}/events", [
            'events' => [['event_type' => 'policy.decision']],
        ])->assertNotFound();
        $this->getJson("/api/talos/runs/{$foreignRun->id}/replay")->assertNotFound();
        $this->getJson("/api/talos/runs/{$foreignRun->id}/artifacts")->assertNotFound();
        $this->postJson("/api/talos/runs/{$foreignRun->id}/artifacts", [
            'artifact_type' => 'evidence_report',
            'uri' => 'local://foreign.json',
        ])->assertNotFound();
    }
}
