<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosBrowserApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private FakeBrowserSessionClient $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->useIsolatedLocalStorage();
        $this->client = new FakeBrowserSessionClient();
        $this->app->instance(BrowserSessionClient::class, $this->client);
    }

    public function test_unauthenticated_session_creation_returns_existing_auth_error(): void
    {
        auth()->logout();
        $this->postJson('/api/talos/browser/sessions')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'TALOS_AUTH_REQUIRED');
    }

    public function test_authenticated_user_can_create_an_owned_read_only_browser_session(): void
    {
        $response = $this->postJson('/api/talos/browser/sessions', [
            'viewport' => ['width' => 1280, 'height' => 800],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'read_only')
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.capabilities', ['navigate', 'screenshot', 'snapshot']);
        $sessionId = $response->json('data.id');
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $sessionId, 'user_id' => $this->user->id, 'mode' => 'read_only']);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $sessionId, 'type' => 'session.created']);
        $this->assertSame('talos-user:'.$this->user->id, $this->client->requests[0]['ownerRef']);
    }

    public function test_foreign_users_get_not_found_for_every_browser_session_event_and_artifact_route(): void
    {
        $session = $this->createSession();
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $session->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/foreign.json', 'metadata' => []]);
        $foreign = User::factory()->create(); $this->actingAs($foreign);

        foreach (["/api/talos/browser/sessions/{$session->id}", "/api/talos/browser/sessions/{$session->id}/events", "/api/talos/browser/artifacts/{$artifact->id}", "/api/talos/browser/artifacts/{$artifact->id}/preview"] as $route) $this->getJson($route)->assertNotFound();
        $this->deleteJson("/api/talos/browser/sessions/{$session->id}")->assertNotFound();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])->assertNotFound();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")->assertNotFound();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")->assertNotFound();
    }

    public function test_unsafe_urls_are_denied_before_worker_dispatch_and_persist_policy_events(): void
    {
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(resolver: fn (): array => ['127.0.0.1']));
        $session = $this->createSession();
        foreach (['http://127.0.0.1', 'http://localhost', 'file:///tmp/a', 'data:text/plain,x', 'javascript:alert(1)', 'https://user:pass@example.com'] as $url) {
            $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => $url])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_POLICY_DENIED');
        }
        $this->assertSame(1, count($this->client->requests));
        $this->assertSame(6, TalosBrowserEvent::query()->where('browser_session_id', $session->id)->where('type', 'policy.denied')->count());
        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_POLICY_DENIED');
        $this->assertSame(1, count($this->client->requests));
    }

    public function test_navigation_records_events_and_updates_current_page(): void
    {
        $session = $this->createSession();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])
            ->assertOk()->assertJsonPath('data.current_url', 'https://example.com')->assertJsonPath('data.current_title', 'Example page');
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $session->id, 'type' => 'navigation.requested']);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $session->id, 'type' => 'navigation.completed']);
    }

    public function test_screenshot_is_private_and_owner_preview_returns_png_without_paths_or_base64(): void
    {
        $session = $this->createSession();
        $response = $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")->assertCreated()->assertJsonPath('data.mime', 'image/png')->assertJsonMissingPath('data.storage_path')->assertJsonMissingPath('data.base64');
        $artifactId = $response->json('data.id'); $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
        $this->get("/api/talos/browser/artifacts/{$artifactId}/preview")->assertOk()->assertHeader('content-type', 'image/png');
    }

    public function test_snapshot_stores_digest_metadata_without_exposing_worker_internals(): void
    {
        $session = $this->createSession();
        $response = $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")->assertCreated()->assertJsonPath('data.type', 'snapshot')->assertJsonPath('data.metadata.format', 'accessibility_refs_v1')->assertJsonMissingPath('data.storage_path')->assertJsonMissingPath('data.sessionId')->assertJsonMissingPath('data.nodes');
        $artifactId = $response->json('data.id');
        $this->getJson("/api/talos/browser/artifacts/{$artifactId}/preview")
            ->assertOk()
            ->assertJsonPath('data.preview_available', true)
            ->assertJsonPath('data.snapshot.untrusted', true)
            ->assertJsonMissingPath('data.snapshot.sessionId');
    }

    public function test_worker_errors_are_controlled_and_no_destructive_browser_route_exists(): void
    {
        $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is unavailable.');
        $this->postJson('/api/talos/browser/sessions')->assertStatus(503)->assertJsonPath('code', 'TALOS_BROWSER_WORKER_UNAVAILABLE');
        $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker failed.');
        $this->postJson('/api/talos/browser/sessions')->assertStatus(502)->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');
        $this->postJson('/api/talos/browser/sessions/actions')->assertMethodNotAllowed();
    }

    public function test_unsafe_final_worker_redirect_is_denied_without_persisting_unsafe_page_state(): void
    {
        $session = $this->createSession();
        $this->client->navigateResponse = ['url' => 'http://127.0.0.1/private', 'title' => 'Private', 'status' => 'active'];

        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_POLICY_DENIED');

        $session->refresh();
        $this->assertNull($session->current_url);
        $this->assertNull($session->current_title);
        $this->assertSame('ready', $session->status);
        $this->assertSame('navigate', $this->client->requests[1]['method']);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $session->id, 'type' => 'policy.denied', 'url_after' => 'http://127.0.0.1/private']);
    }

    public function test_closed_session_rejects_read_only_operations_with_stable_browser_state_errors(): void
    {
        $session = $this->createSession();
        $this->deleteJson("/api/talos/browser/sessions/{$session->id}")->assertOk();

        foreach (['navigate' => ['url' => 'https://example.com'], 'screenshot' => [], 'snapshot' => []] as $action => $payload) {
            $this->postJson("/api/talos/browser/sessions/{$session->id}/{$action}", $payload)
                ->assertConflict()
                ->assertJsonPath('code', 'TALOS_BROWSER_INVALID_STATE')
                ->assertJsonStructure(['code', 'message', 'details']);
        }
        $this->assertSame('closed', $session->fresh()->status);
        $this->assertCount(2, $this->client->requests);
    }

    public function test_malformed_or_empty_screenshot_response_creates_no_artifact(): void
    {
        $session = $this->createSession();
        $this->client->screenshotResponse = ['mime' => 'image/png', 'base64' => ''];

        $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")
            ->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');
        $this->assertDatabaseCount('talos_browser_artifacts', 0);
    }

    public function test_browser_validation_and_missing_resources_have_stable_error_envelopes(): void
    {
        $this->postJson('/api/talos/browser/sessions', ['viewport' => ['width' => 1]])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_VALIDATION_FAILED')
            ->assertJsonStructure(['code', 'message', 'details']);
        $this->getJson('/api/talos/browser/sessions/not-a-session')
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_NOT_FOUND')
            ->assertJsonStructure(['code', 'message', 'details']);
        $this->getJson('/api/talos/browser/artifacts/not-an-artifact')
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_NOT_FOUND');
    }

    public function test_artifact_requires_an_owned_parent_session_even_if_artifact_user_id_matches(): void
    {
        $foreign = User::factory()->create();
        $foreignSession = TalosBrowserSession::query()->create(['user_id' => $foreign->id, 'worker_session_id' => 'worker-foreign', 'status' => 'ready', 'mode' => 'read_only', 'viewport_width' => 1280, 'viewport_height' => 800, 'capabilities' => [], 'policy' => []]);
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $foreignSession->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/incoherent.json', 'metadata' => []]);

        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}")
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_NOT_FOUND');
    }

    public function test_fake_browser_client_sequences_worker_ids_deterministically(): void
    {
        $first = $this->postJson('/api/talos/browser/sessions')->assertCreated();
        $second = $this->postJson('/api/talos/browser/sessions')->assertCreated();

        $this->assertSame('worker-1', TalosBrowserSession::query()->findOrFail($first->json('data.id'))->worker_session_id);
        $this->assertSame('worker-2', TalosBrowserSession::query()->findOrFail($second->json('data.id'))->worker_session_id);
    }

    public function test_browser_api_exposes_only_supported_read_only_capabilities(): void
    {
        $session = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'worker_session_id' => 'legacy-worker-capabilities',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigate', 'actions', 'screenshot', 'download', 'snapshot'],
            'policy' => [],
        ]);

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.capabilities', ['navigate', 'screenshot', 'snapshot']);
    }

    public function test_testing_container_binds_an_isolated_fake_browser_client(): void
    {
        $this->app->forgetInstance(BrowserSessionClient::class);

        $this->assertInstanceOf(FakeBrowserSessionClient::class, $this->app->make(BrowserSessionClient::class));
    }

    public function test_http_browser_client_accepts_a_successful_no_content_close_response(): void
    {
        Http::fake([
            'http://browser-worker.test/sessions/worker-1' => Http::response(status: 204),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->close('talos-user:1', 'worker-1');

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && $request->url() === 'http://browser-worker.test/sessions/worker-1'
            && $request->hasHeader('X-Talos-Worker-Token', 'worker-token')
            && $request->hasHeader('X-Talos-Owner-Ref', 'talos-user:1'));
    }

    public function test_deleting_browser_session_cascades_to_events_and_artifacts(): void
    {
        $session = $this->createSession();
        $event = TalosBrowserEvent::query()->where('browser_session_id', $session->id)->firstOrFail();
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $session->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/cascade.json', 'metadata' => []]);

        $session->delete();

        $this->assertDatabaseMissing('talos_browser_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
    }

    public function test_browser_child_migrations_use_string_foreign_keys_matching_browser_session_ids(): void
    {
        foreach (['2026_07_10_000014_create_talos_browser_events_table.php', '2026_07_10_000015_create_talos_browser_artifacts_table.php'] as $migration) {
            $source = file_get_contents(database_path("migrations/{$migration}"));
            $this->assertIsString($source);
            $this->assertStringContainsString("\$table->string('browser_session_id');", $source);
            $this->assertStringContainsString("\$table->foreign('browser_session_id')->references('id')->on('talos_browser_sessions')->cascadeOnDelete();", $source);
            $this->assertStringNotContainsString("\$table->foreignUuid('browser_session_id')", $source);
        }
    }

    public function test_owned_snapshot_preview_returns_bounded_explicitly_untrusted_snapshot_view(): void
    {
        $session = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")->assertCreated()->json('data.id');

        $this->getJson("/api/talos/browser/artifacts/{$artifactId}/preview")
            ->assertOk()
            ->assertJsonPath('data.preview_available', true)
            ->assertJsonPath('data.snapshot.format', 'accessibility_refs_v1')
            ->assertJsonPath('data.snapshot.url', 'https://example.com')
            ->assertJsonPath('data.snapshot.title', 'Example page')
            ->assertJsonPath('data.snapshot.nodes.0.ref', 'r1')
            ->assertJsonPath('data.snapshot.nodes.0.role', 'heading')
            ->assertJsonPath('data.snapshot.nodes.0.name', 'Example')
            ->assertJsonPath('data.snapshot.nodes.0.visible', true)
            ->assertJsonPath('data.snapshot.text_digest', hash('sha256', 'snapshot'))
            ->assertJsonMissingPath('data.snapshot.sessionId')
            ->assertJsonMissingPath('data.snapshot.cookies')
            ->assertJsonMissingPath('data.snapshot.localStorage')
            ->assertJsonMissingPath('data.artifact.storage_path');
    }

    public function test_missing_or_malformed_snapshot_preview_returns_controlled_browser_error(): void
    {
        $session = $this->createSession();
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $session->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/missing-snapshot.json', 'metadata' => []]);
        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}/preview")
            ->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_ARTIFACT_INVALID')
            ->assertJsonStructure(['code', 'message', 'details']);
    }

    public function test_snapshot_preview_discards_unknown_fields_and_bounds_nodes(): void
    {
        $session = $this->createSession();
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $session->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/bounded-snapshot.json', 'metadata' => []]);
        Storage::disk('local')->put($artifact->storage_path, json_encode(['format' => 'accessibility_refs_v1', 'url' => 'https://example.com', 'title' => 'Example', 'textDigest' => hash('sha256', 'bounded'), 'cookies' => ['secret'], 'body' => str_repeat('x', 10000), 'nodes' => array_fill(0, 250, ['ref' => 'r', 'role' => 'link', 'name' => 'Safe', 'visible' => true, 'unknown' => 'hidden'])], JSON_THROW_ON_ERROR));

        $response = $this->getJson("/api/talos/browser/artifacts/{$artifact->id}/preview")
            ->assertOk()
            ->assertJsonPath('data.snapshot.untrusted', true)
            ->assertJsonCount(200, 'data.snapshot.nodes')
            ->assertJsonMissingPath('data.snapshot.nodes.0.unknown')
            ->assertJsonMissingPath('data.snapshot.cookies')
            ->assertJsonMissingPath('data.snapshot.body');
        $this->assertSame('Safe', $response->json('data.snapshot.nodes.0.name'));
    }

    private function createSession(): TalosBrowserSession
    {
        $id = $this->postJson('/api/talos/browser/sessions')->assertCreated()->json('data.id');
        return TalosBrowserSession::query()->findOrFail($id);
    }
}
