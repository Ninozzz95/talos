<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosApiToken;
use App\Models\TalosAuditEvent;
use App\Models\TalosRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

final class TalosAuditApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();

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

    public function test_audit_payloads_use_the_core_redaction_boundary_before_display(): void
    {
        $redacted = TalosAuditEvent::redact([
            'authorization' => 'Bearer provider-secret',
            'storage_path' => 'C:\\Users\\operator\\AppData\\Local\\TALOS\\artifact.json',
            'nested' => [
                'clientSecret' => 'provider-secret-camel',
                'diagnostic' => 'Worker copied /var/lib/talos/private/artifact.json before exit.',
                'safe_value' => 'visible',
            ],
        ]);

        $this->assertSame('[redacted]', $redacted['authorization'] ?? null);
        $this->assertSame('[redacted]', $redacted['storage_path'] ?? null);
        $this->assertSame('[redacted]', $redacted['nested']['clientSecret'] ?? null);
        $this->assertSame('Worker copied [redacted] before exit.', $redacted['nested']['diagnostic'] ?? null);
        $this->assertSame('visible', $redacted['nested']['safe_value'] ?? null);
    }

    public function test_browser_action_tokens_and_private_keys_never_persist_in_audit_payloads(): void
    {
        $actionCapability = 'eyJhbGciOiJFUzI1NiIsInR5cCI6InRhbG9zLWJyb3dzZXItYWN0aW9uK2p3dCJ9'
            .'.eyJzdWIiOiJ0ZXN0In0.'
            .str_repeat('a', 86);

        $event = TalosAuditEvent::record('browser.action.rejected', 'browser_action', 'action-1', [
            'diagnostic' => 'Rejected '.$actionCapability.' during verification.',
            'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64' => 'synthetic-private-key-material',
            'reason_code' => 'capability_invalid',
        ]);

        $payload = $event->fresh()->payload;
        $this->assertSame('Rejected [redacted] during verification.', $payload['diagnostic'] ?? null);
        $this->assertSame('[redacted]', $payload['TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'] ?? null);
        $this->assertSame('capability_invalid', $payload['reason_code'] ?? null);
        $this->assertStringNotContainsString($actionCapability, json_encode($payload, JSON_THROW_ON_ERROR));
        $this->assertStringNotContainsString('synthetic-private-key-material', json_encode($payload, JSON_THROW_ON_ERROR));
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
        $this->useIsolatedLocalStorage();

        $fileResponse = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('audit.txt', 'Audit this upload.'),
        ])->assertCreated();
        $fileId = $fileResponse->json('data.id');
        $this->assertIsString($fileId);

        $run = TalosRun::query()->create([
            'user_id' => auth()->id(),
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

        $this->withHeader('X-Talos-Registry-Token', 'wrong-secret')
            ->postJson('/api/talos/tools', [])
            ->assertForbidden();

        $events = TalosAuditEvent::query()
            ->where('event_type', 'registry_write.denied')
            ->orderBy('subject_type')
            ->get();

        $this->assertSame(['connector', 'tool'], $events->pluck('subject_type')->all());
        foreach ($events as $event) {
            $this->assertSame(true, $event->payload['credential_present'] ?? null);
            $this->assertArrayNotHasKey('provided_token', $event->payload);
            $this->assertStringNotContainsString('wrong-secret', json_encode($event->payload, JSON_THROW_ON_ERROR));
        }
    }
}
