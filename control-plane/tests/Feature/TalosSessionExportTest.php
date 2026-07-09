<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

final class TalosSessionExportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_session_json_export_redacts_secrets_and_includes_evidence_manifest(): void
    {
        [$session, $run] = $this->seedExportableSession();

        $response = $this->getJson("/api/talos/sessions/{$session->id}/export");

        $response
            ->assertOk()
            ->assertHeader('Content-Disposition')
            ->assertJsonPath('schema_version', 1)
            ->assertJsonPath('report_type', 'talos_session_export')
            ->assertJsonPath('export_status', 'complete')
            ->assertJsonPath('session.id', $session->id)
            ->assertJsonPath('messages.0.role', 'user')
            ->assertJsonPath('messages.1.role', 'assistant')
            ->assertJsonPath('messages.1.model_profile.display_name', 'OpenAI Work')
            ->assertJsonPath('messages.1.model_profile.has_secret', true)
            ->assertJsonPath('messages.1.used_context.0.file_name', 'incident-report.md')
            ->assertJsonPath('messages.1.used_memories.0.title', 'Ops preference')
            ->assertJsonPath('runs.0.id', $run->id)
            ->assertJsonPath('runs.0.replayability_state.replayable', true)
            ->assertJsonPath('runs.0.replayability_state.events_count', 1)
            ->assertJsonPath('context_manifest.context_sets.0.name', 'Incident context')
            ->assertJsonPath('context_manifest.context_sets.0.sources.0.file.original_name', 'incident-report.md')
            ->assertJsonPath('benchmark_readiness.ready', true)
            ->assertJsonPath('benchmark_readiness.scenario.prompt_hash', $run->prompt_hash);

        $json = $response->getContent();
        $this->assertIsString($json);
        $this->assertStringNotContainsString('private/storage/path', $json);
        $this->assertStringNotContainsString('sk-live-secret', $json);
        $this->assertStringNotContainsString('encrypted-secret', $json);
        $this->assertStringNotContainsString('TAIL_SHOULD_NOT_EXPORT', $json);

        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'session.exported',
            'subject_type' => 'talos_session',
            'subject_id' => $session->id,
        ]);
    }

    public function test_session_markdown_export_returns_transcript_without_secret_fields(): void
    {
        [$session] = $this->seedExportableSession();

        $response = $this->getJson("/api/talos/sessions/{$session->id}/export?format=markdown");

        $response
            ->assertOk()
            ->assertJsonPath('report_type', 'talos_session_markdown_export')
            ->assertJsonPath('content_type', 'text/markdown');

        $content = $response->json('content');
        $this->assertIsString($content);
        $this->assertStringContainsString('# TALOS Session Export', $content);
        $this->assertStringContainsString('Investigate latency.', $content);
        $this->assertStringContainsString('Latency report.', $content);
        $this->assertStringNotContainsString('sk-live-secret', $content);
        $this->assertStringNotContainsString('private/storage/path', $content);
    }

    public function test_session_benchmark_scenario_export_requires_complete_readiness(): void
    {
        [$session, $run] = $this->seedExportableSession();

        $this->getJson("/api/talos/sessions/{$session->id}/export?format=benchmark_scenario")
            ->assertOk()
            ->assertJsonPath('report_type', 'talos_benchmark_scenario_export')
            ->assertJsonPath('scenario.prompt_hash', $run->prompt_hash)
            ->assertJsonPath('scenario.context_hash', $run->metadata['context_hash']);

        $empty = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Empty export',
            'mode' => 'verified_execution',
        ]);

        $this->getJson("/api/talos/sessions/{$empty->id}/export?format=benchmark_scenario")
            ->assertUnprocessable()
            ->assertJsonPath('error', 'SESSION_EXPORT_NOT_BENCHMARK_READY');
    }

    public function test_session_export_rejects_unknown_format_without_audit_event(): void
    {
        [$session] = $this->seedExportableSession();

        $this->getJson("/api/talos/sessions/{$session->id}/export?format=zip")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['format']);

        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'session.exported')
            ->where('subject_id', $session->id)
            ->count());
    }

    public function test_session_export_is_scoped_to_the_authenticated_user(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $foreignSession = TalosSession::query()->create([
            'user_id' => $other->id,
            'title' => 'Foreign export',
            'mode' => 'verified_execution',
        ]);

        $this->actingAs($owner);

        $this->getJson("/api/talos/sessions/{$foreignSession->id}/export")
            ->assertNotFound();

        $this->assertDatabaseMissing('talos_audit_events', [
            'event_type' => 'session.exported',
            'subject_id' => $foreignSession->id,
        ]);
    }

    /**
     * @return array{0: TalosSession, 1: TalosRun}
     */
    private function seedExportableSession(): array
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Incident export',
            'mode' => 'verified_execution',
            'metadata' => ['surface' => 'chat', 'api_key' => 'sk-live-secret'],
        ]);
        assert($session instanceof TalosSession);

        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'OpenAI Work',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('encrypted-secret'),
        ]);
        assert($profile instanceof TalosModelProfile);

        $file = TalosFile::query()->create([
            'original_name' => 'incident-report.md',
            'mime_type' => 'text/markdown',
            'size_bytes' => 4096,
            'checksum' => hash('sha256', 'incident-report'),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => 'private/storage/path/incident-report.md',
            'parser' => 'markdown',
        ]);
        assert($file instanceof TalosFile);

        $chunk = TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => str_repeat('Evidence detail. ', 30) . 'TAIL_SHOULD_NOT_EXPORT',
            'content_hash' => hash('sha256', 'incident chunk'),
            'start_offset' => 0,
            'end_offset' => 720,
        ]);
        assert($chunk instanceof TalosFileChunk);

        $contextSet = TalosContextSet::query()->create([
            'name' => 'Incident context',
            'status' => 'available',
        ]);
        assert($contextSet instanceof TalosContextSet);

        TalosContextSource::query()->create([
            'context_set_id' => $contextSet->id,
            'file_id' => $file->id,
            'file_chunk_id' => $chunk->id,
            'source_type' => 'file_chunk',
            'sequence' => 1,
        ]);

        $run = TalosRun::query()->create([
            'session_id' => $session->id,
            'model_profile_id' => $profile->id,
            'context_set_id' => $contextSet->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt' => 'Investigate latency.',
            'prompt_hash' => hash('sha256', 'Investigate latency.'),
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'metadata' => [
                'context_hash' => hash('sha256', 'Incident context'),
                'evaluator_version' => 'kadmos-core-benchmark-v1',
            ],
        ]);
        assert($run instanceof TalosRun);

        TalosRunEvent::query()->create([
            'run_id' => $run->id,
            'sequence' => 1,
            'event_type' => 'chat.response',
            'severity' => 'info',
            'payload' => [
                'summary' => 'ok',
                'api_key' => 'sk-live-secret',
            ],
        ]);

        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Investigate latency.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'assistant',
            'content' => 'Latency report.',
            'model_profile_id' => $profile->id,
            'run_id' => $run->id,
            'metadata' => [
                'used_context' => [[
                    'context_set_id' => $contextSet->id,
                    'file_id' => $file->id,
                    'chunk_id' => $chunk->id,
                    'file_name' => 'incident-report.md',
                    'preview' => 'Evidence detail.',
                ]],
                'used_memories' => [[
                    'id' => 'memory-1',
                    'title' => 'Ops preference',
                    'scope_type' => 'project',
                ]],
                'api_key' => 'sk-live-secret',
            ],
        ]);

        return [$session, $run];
    }
}
