<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserLegacyV1Adapter;
use App\Services\Talos\Browser\TalosBrowserLegacyWritesDisabled;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Throwable;

final class TalosBrowserLegacyV1AdapterTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_projection_is_owner_scoped_deterministic_and_never_claims_v1_commit(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'projection-owner');
        [$browser, $event, $artifact] = $this->legacyRows($owner, $chat, 'projection-owner');

        $foreignOwner = User::factory()->create();
        $foreignChat = $this->chat($foreignOwner, 'projection-foreign');
        $this->legacyRows($foreignOwner, $foreignChat, 'projection-foreign');

        $before = $this->legacyCounts();
        $adapter = $this->app->make(TalosBrowserLegacyV1Adapter::class);
        $first = $adapter->projectForSession($chat);
        $second = $adapter->projectForSession($chat);

        $this->assertSame($first, $second);
        $this->assertSame($before, $this->legacyCounts());
        $this->assertSame('talos.browser.legacy-projection.v1', $first['schema_version']);
        $this->assertSame('legacy_unverified', $first['commit_state']);
        $this->assertFalse($first['committed_v1']);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', $first['projection_hash']);
        $this->assertCount(1, $first['sessions']);
        $this->assertSame($browser->id, $first['sessions'][0]['id']);
        $this->assertSame($event->id, $first['sessions'][0]['events'][0]['id']);
        $this->assertSame($artifact->id, $first['sessions'][0]['artifacts'][0]['id']);
        $this->assertFalse($first['sessions'][0]['artifacts'][0]['committed_v1']);
        $this->assertArrayNotHasKey('storage_path', $first['sessions'][0]['artifacts'][0]);

        $encoded = json_encode($first, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('private/browser/path', $encoded);
        $this->assertStringNotContainsString('legacy-secret', $encoded);
        $this->assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_session_export_preserves_legacy_browser_activity_with_an_explicit_unverified_marker(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'export');
        [$browser] = $this->legacyRows($owner, $chat, 'export');

        TalosMessage::query()->create([
            'session_id' => $chat->id,
            'role' => 'user',
            'content' => 'Inspect the page.',
        ]);
        TalosMessage::query()->create([
            'session_id' => $chat->id,
            'role' => 'assistant',
            'content' => 'Historical Browser result.',
            'metadata' => [
                'browser_activities' => [[
                    'id' => 'legacy-activity',
                    'operation' => 'snapshot',
                    'status' => 'succeeded',
                    'browser_session_id' => $browser->id,
                    'artifact_ids' => [$browser->last_snapshot_artifact_id],
                ]],
                'browser_evidence_contract' => ['committed_v1' => true],
            ],
        ]);

        $response = $this->getJson("/api/talos/sessions/{$chat->id}/export");

        $response
            ->assertOk()
            ->assertJsonPath('messages.1.metadata.browser_activities.0.id', 'legacy-activity')
            ->assertJsonPath('messages.1.metadata.browser_evidence_contract.schema_version', 'talos.browser.legacy-projection.v1')
            ->assertJsonPath('messages.1.metadata.browser_evidence_contract.commit_state', 'legacy_unverified')
            ->assertJsonPath('messages.1.metadata.browser_evidence_contract.committed_v1', false)
            ->assertJsonPath('browser_legacy_projection.schema_version', 'talos.browser.legacy-projection.v1')
            ->assertJsonPath('browser_legacy_projection.sessions.0.id', $browser->id)
            ->assertJsonPath('browser_legacy_projection.committed_v1', false);

        $encoded = (string) $response->getContent();
        $this->assertStringNotContainsString('private/browser/path', $encoded);
        $this->assertStringNotContainsString('legacy-secret', $encoded);
    }

    public function test_legacy_write_cutover_rejects_before_worker_or_database_mutation(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'cutover');
        [$browser] = $this->legacyRows($owner, $chat, 'cutover');
        $this->withHeader('X-Talos-Session-Id', $chat->id);

        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        config(['services.talos.browser.legacy_writes_enabled' => false]);

        $this->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $chat->id,
            'viewport' => ['width' => 1280, 'height' => 800],
        ])->assertConflict()->assertJsonPath('code', 'TALOS_BROWSER_LEGACY_WRITES_DISABLED');

        $this->postJson("/api/talos/browser/sessions/{$browser->id}/navigate", [
            'url' => 'https://example.test/next',
        ])->assertConflict()->assertJsonPath('code', 'TALOS_BROWSER_LEGACY_WRITES_DISABLED');

        $this->assertSame([], $client->requests);
        $this->assertDatabaseCount('talos_browser_sessions', 1);
        $this->assertSame('ready', $browser->refresh()->status);
    }

    public function test_legacy_models_reject_direct_creates_and_updates_when_cutover_is_disabled(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'model-gate');
        [$browser] = $this->legacyRows($owner, $chat, 'model-gate');
        config(['services.talos.browser.legacy_writes_enabled' => false]);

        $this->assertLegacyWriteFails(fn () => TalosBrowserEvent::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $owner->id,
            'type' => 'legacy.write',
            'actor' => 'system',
            'payload' => [],
        ]));
        $this->assertLegacyWriteFails(fn () => TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $owner->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'private/browser/path/blocked.json',
            'sha256' => hash('sha256', 'blocked'),
            'metadata' => [],
        ]));
        $this->assertLegacyWriteFails(function () use ($browser): void {
            $browser->status = 'active';
            $browser->save();
        });

        $this->assertDatabaseMissing('talos_browser_events', ['type' => 'legacy.write']);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['storage_path' => 'private/browser/path/blocked.json']);
        $this->assertSame('ready', $browser->refresh()->status);
    }

    public function test_legacy_reads_and_cleanup_remain_available_when_writes_are_disabled(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'read-cleanup');
        [$browser, $event, $artifact] = $this->legacyRows($owner, $chat, 'read-cleanup');
        $this->withHeader('X-Talos-Session-Id', $chat->id);

        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        config(['services.talos.browser.legacy_writes_enabled' => false]);

        $this->getJson("/api/talos/browser/sessions/{$browser->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $browser->id);
        $this->getJson("/api/talos/browser/sessions/{$browser->id}/events")
            ->assertOk()
            ->assertJsonPath('data.0.id', $event->id);
        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $artifact->id)
            ->assertJsonMissingPath('data.storage_path');
        $this->assertSame([], $client->requests);

        $chat->delete();
        $this->assertDatabaseMissing('talos_browser_sessions', ['id' => $browser->id]);
        $this->assertDatabaseMissing('talos_browser_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
    }

    public function test_nested_legacy_metadata_cannot_spoof_committed_v1_evidence(): void
    {
        $owner = $this->authenticateTalosUser();
        $chat = $this->chat($owner, 'trust-spoof');
        $this->legacyRows($owner, $chat, 'trust-spoof');

        $projection = $this->app
            ->make(TalosBrowserLegacyV1Adapter::class)
            ->projectForSession($chat);

        $artifactMetadata = $projection['sessions'][0]['artifacts'][0]['metadata'];
        $eventPayload = $projection['sessions'][0]['events'][0]['payload'];

        $this->assertArrayNotHasKey('committed_v1', $artifactMetadata);
        $this->assertArrayNotHasKey('commit_state', $artifactMetadata);
        $this->assertArrayNotHasKey('browser_evidence_contract', $artifactMetadata);
        $this->assertArrayNotHasKey('committed_v1', $eventPayload);
        $this->assertArrayNotHasKey('commit_state', $eventPayload);
        $this->assertArrayNotHasKey('browser_evidence_contract', $eventPayload);
        $this->assertFalse($projection['sessions'][0]['artifacts'][0]['committed_v1']);
        $this->assertSame('legacy_unverified', $projection['sessions'][0]['artifacts'][0]['commit_state']);
    }

    private function chat(User $owner, string $suffix): TalosSession
    {
        return TalosSession::query()->create([
            'user_id' => $owner->id,
            'title' => 'Legacy Browser '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
    }

    /** @return array{TalosBrowserSession, TalosBrowserEvent, TalosBrowserArtifact} */
    private function legacyRows(User $owner, TalosSession $chat, string $suffix): array
    {
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $owner->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'legacy-worker-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/?token=legacy-secret',
            'current_title' => 'Legacy page',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
            'last_seen_at' => now(),
        ]);
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $owner->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'private/browser/path/'.$suffix.'.json',
            'sha256' => hash('sha256', 'legacy-'.$suffix),
            'metadata' => [
                'url' => 'https://example.test/?token=legacy-secret',
                'api_key' => 'legacy-secret',
                'text_digest' => hash('sha256', 'legacy text'),
                'committed_v1' => true,
                'commit_state' => 'committed',
                'browser_evidence_contract' => [
                    'schema_version' => 'talos.browser.evidence.v1',
                    'committed_v1' => true,
                ],
            ],
        ]);
        $browser->update(['last_snapshot_artifact_id' => $artifact->id]);
        $event = TalosBrowserEvent::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $owner->id,
            'type' => 'snapshot.captured',
            'actor' => 'worker',
            'command_id' => 'legacy-command-'.$suffix,
            'url_before' => null,
            'url_after' => 'https://example.test/?token=legacy-secret',
            'payload' => [
                'artifact_id' => $artifact->id,
                'api_key' => 'legacy-secret',
                'committed_v1' => true,
                'commit_state' => 'committed',
                'browser_evidence_contract' => ['committed_v1' => true],
            ],
            'policy_decision' => [],
        ]);

        return [$browser->refresh(), $event, $artifact];
    }

    /** @return array{sessions: int, events: int, artifacts: int, v1_evidence: int} */
    private function legacyCounts(): array
    {
        return [
            'sessions' => TalosBrowserSession::query()->count(),
            'events' => TalosBrowserEvent::query()->count(),
            'artifacts' => TalosBrowserArtifact::query()->count(),
            'v1_evidence' => TalosBrowserEvidenceBundle::query()->count(),
        ];
    }

    private function assertLegacyWriteFails(callable $operation): void
    {
        try {
            $operation();
            $this->fail('A disabled legacy Browser write was accepted.');
        } catch (Throwable $exception) {
            $this->assertInstanceOf(TalosBrowserLegacyWritesDisabled::class, $exception);
        }
    }
}
