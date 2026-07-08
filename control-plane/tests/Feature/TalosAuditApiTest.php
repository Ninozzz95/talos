<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosApiToken;
use App\Models\TalosAuditEvent;
use App\Models\TalosRun;
use Illuminate\Http\UploadedFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosAuditApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.talos.model_provider_allowed_hosts' => [
                'api.openai.test',
                'api.openai.com',
            ],
        ]);
    }

    public function test_provider_profile_create_writes_redacted_audit_event(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'OpenAI Work',
            'secret' => 'sk-secret-value',
            'base_url' => 'https://api.openai.test/v1',
        ])->assertCreated();

        $event = TalosAuditEvent::query()->where('event_type', 'model_profile.created')->firstOrFail();

        $this->assertSame('model_profile', $event->subject_type);
        $this->assertSame('[redacted]', $event->payload['secret'] ?? null);
        $this->assertNotContains('sk-secret-value', $event->payload);
    }

    public function test_audit_api_filters_by_event_type(): void
    {
        TalosAuditEvent::record('model_profile.created', 'model_profile', 'profile-1', ['provider' => 'openai']);
        TalosAuditEvent::record('recovery.requested', 'run', 'run-1', ['node_id' => 'node-1']);

        $plainToken = TalosApiToken::issue('audit-reader', ['talos.audit.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/audit-events?event_type=recovery.requested')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.event_type', 'recovery.requested')
            ->assertJsonPath('data.0.subject_id', 'run-1');
    }

    public function test_critical_runtime_actions_write_audit_events(): void
    {
        Storage::fake('local');

        $fileResponse = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('audit.txt', 'Audit this upload.'),
        ])->assertCreated();
        $fileId = $fileResponse->json('data.id');
        $this->assertIsString($fileId);

        $run = TalosRun::query()->create([
            'mode' => 'avm_on',
            'status' => 'blocked',
            'prompt_hash' => hash('sha256', 'audit recovery'),
        ]);

        $this->postJson("/api/talos/runs/{$run->id}/recover", [
            'action' => 'retry_node',
            'node_id' => 'extract_file',
            'reason' => 'Audit HMI recovery.',
        ])->assertCreated();

        $calendar = $this->postJson('/api/talos/calendar-drafts', [
            'title' => 'Audit calendar',
            'starts_at' => '2026-07-09T10:00:00+02:00',
            'ends_at' => '2026-07-09T10:30:00+02:00',
            'attendees' => ['ops@example.com'],
        ])->assertCreated();
        $calendarId = $calendar->json('data.id');
        $this->assertIsString($calendarId);

        $this->postJson("/api/talos/calendar-drafts/{$calendarId}/confirm")
            ->assertOk();

        $draft = $this->postJson('/api/talos/email/drafts', [
            'to' => ['ops@example.com'],
            'subject' => 'Audit email',
            'body' => 'Draft only.',
        ])->assertCreated();
        $draftId = $draft->json('data.id');
        $this->assertIsString($draftId);

        $this->postJson("/api/talos/email/drafts/{$draftId}/send")
            ->assertForbidden();

        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'file.uploaded',
            'subject_type' => 'file',
            'subject_id' => $fileId,
        ]);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'recovery.requested',
            'subject_type' => 'run',
            'subject_id' => $run->id,
        ]);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'calendar.confirmed',
            'subject_type' => 'calendar_draft',
            'subject_id' => $calendarId,
        ]);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'email.send_denied',
            'subject_type' => 'email_draft',
            'subject_id' => $draftId,
        ]);
    }

    public function test_registry_write_denial_creates_audit_event_without_token_leak(): void
    {
        config(['services.talos.registry_write_token' => 'registry-secret']);

        $this->withHeader('X-Talos-Registry-Token', 'wrong-secret')
            ->postJson('/api/talos/connectors', [
                'key' => 'audit_connector',
                'display_name' => 'Audit Connector',
            ])
            ->assertForbidden();

        $event = TalosAuditEvent::query()->where('event_type', 'registry_write.denied')->firstOrFail();

        $this->assertSame('connector', $event->subject_type);
        $this->assertSame(true, $event->payload['credential_present'] ?? null);
        $this->assertSame('[redacted]', $event->payload['provided_token'] ?? null);
    }
}
