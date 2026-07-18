<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerConfiguration;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use App\Services\Talos\Browser\TalosBrowserArtifactReconciler;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosBrowserApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private TalosSession $chatSession;

    private FakeBrowserSessionClient $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->chatSession = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Browser API chat',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $this->withHeader('X-Talos-Session-Id', $this->chatSession->id);
        $this->useIsolatedLocalStorage();
        config(['services.talos.browser.dev_evidence' => true]);
        $this->client = new FakeBrowserSessionClient;
        $this->client->snapshotResponse = [
            'sessionId' => 'worker-1',
            'snapshotId' => 'snap_123e4567-e89b-12d3-a456-426614174000',
            'format' => 'accessibility_refs_v1',
            'url' => 'https://example.com',
            'title' => 'Example page',
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]],
            'textDigest' => hash('sha256', 'snapshot'),
            'capturedAt' => now()->toJSON(),
        ];
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
        $this->client->createResponse = [
            'sessionId' => 'worker-versioned-session',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'hmiActions' => true, 'downloads' => false, 'uploads' => false],
            'stateVersion' => 3,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $response = $this->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $this->chatSession->id,
            'viewport' => ['width' => 1280, 'height' => 800],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'read_only')
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.state_version', 3)
            ->assertJsonPath('data.talos_session_id', $this->chatSession->id)
            ->assertJsonPath('data.capabilities', ['navigate', 'screenshot', 'snapshot', 'interact']);
        $sessionId = $response->json('data.id');
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $sessionId, 'user_id' => $this->user->id, 'talos_session_id' => $this->chatSession->id, 'mode' => 'read_only', 'worker_state_version' => 3]);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $sessionId, 'type' => 'session.created']);
        $this->assertSame('talos-user:'.$this->user->id, $this->client->requests[0]['ownerRef']);
    }

    public function test_session_creation_accepts_the_negotiated_upload_capability_without_escalating_actions(): void
    {
        $this->client->createResponse = [
            'sessionId' => 'worker-upload-capable-session',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => true,
                'downloads' => false,
                'uploads' => true,
            ],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $response = $this->postJson('/api/talos/browser/sessions', $this->sessionPayload());

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'read_only')
            ->assertJsonPath('data.capabilities', ['navigate', 'screenshot', 'snapshot', 'interact', 'upload']);
        $this->assertDatabaseHas('talos_browser_sessions', [
            'id' => $response->json('data.id'),
            'mode' => 'read_only',
        ]);
        $stored = TalosBrowserSession::query()->findOrFail($response->json('data.id'));
        $this->assertTrue((bool) data_get($stored->capabilities, 'uploads'));
        $this->assertFalse((bool) data_get($stored->capabilities, 'actions'));
        $this->assertFalse((bool) data_get($stored->capabilities, 'downloads'));
    }

    public function test_session_creation_fails_closed_when_the_worker_summary_omits_device_scale_factor(): void
    {
        $this->client->createResponse = [
            'sessionId' => 'worker-without-device-scale',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'hmiActions' => true, 'downloads' => false, 'uploads' => false],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())
            ->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');

        $this->assertDatabaseCount('talos_browser_sessions', 0);
    }

    public function test_session_creation_fails_closed_when_the_worker_reports_a_non_unit_device_scale_factor(): void
    {
        $this->client->createResponse = [
            'sessionId' => 'worker-scaled-device',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 2,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'hmiActions' => true, 'downloads' => false, 'uploads' => false],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())
            ->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');

        $this->assertDatabaseCount('talos_browser_sessions', 0);
    }

    public function test_created_session_persists_the_worker_device_scale_factor(): void
    {
        $response = $this->postJson('/api/talos/browser/sessions', $this->sessionPayload());

        $response->assertCreated();
        $this->assertDatabaseHas('talos_browser_sessions', [
            'id' => $response->json('data.id'),
            'device_scale_factor' => 1,
        ]);
    }

    public function test_session_creation_fails_closed_when_the_worker_cannot_provide_interactive_hmi(): void
    {
        $this->client->createResponse = [
            'sessionId' => 'worker-without-hmi',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => false,
                'downloads' => false,
                'uploads' => false,
            ],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_UNAVAILABLE');

        $this->assertDatabaseCount('talos_browser_sessions', 0);
        $this->assertSame(['create', 'close'], array_column($this->client->requests, 'method'));
    }

    public function test_browser_session_listing_is_scoped_to_the_requested_owned_chat(): void
    {
        $first = $this->createSession();
        $otherChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other browser chat',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $secondId = $this->withHeader('X-Talos-Session-Id', $otherChat->id)->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $otherChat->id,
        ])->assertCreated()->json('data.id');

        $this->withHeader('X-Talos-Session-Id', $this->chatSession->id)
            ->getJson('/api/talos/browser/sessions?talos_session_id='.$this->chatSession->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $first->id)
            ->assertJsonMissing(['id' => $secondId]);
    }

    public function test_show_reconciles_live_worker_capabilities_before_reusing_a_session(): void
    {
        $session = $this->createSession();
        $session->update([
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'downloads' => false,
                'uploads' => false,
            ],
        ]);
        $this->client->inspectResponse = [
            'sessionId' => $session->worker_session_id,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => true,
                'downloads' => false,
                'uploads' => false,
            ],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.capabilities', ['navigate', 'screenshot', 'snapshot', 'interact']);

        $this->assertTrue((bool) data_get($session->fresh()->capabilities, 'hmiActions'));
        $this->assertSame('inspect', $this->client->requests[array_key_last($this->client->requests)]['method']);
    }

    public function test_show_invalidates_a_worker_session_that_disappeared_after_restart(): void
    {
        $session = $this->createSession();
        $this->client->failure = new BrowserWorkerException(
            'TALOS_BROWSER_SESSION_NOT_FOUND',
            'Browser session not found.',
        );

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed');

        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $session->id, 'status' => 'failed']);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'session.worker_lost',
        ]);
    }

    public function test_show_fails_closed_without_invalidating_session_on_transient_worker_outage(): void
    {
        $session = $this->createSession();
        $this->client->failure = new BrowserWorkerException(
            'TALOS_BROWSER_WORKER_UNAVAILABLE',
            'Browser worker is unavailable.',
        );

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'TALOS_BROWSER_WORKER_UNAVAILABLE');

        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $session->id, 'status' => 'ready']);
    }

    public function test_show_does_not_clear_a_local_recovery_requirement_when_the_worker_reports_ready(): void
    {
        $session = $this->createSession();
        $session->update(['status' => 'recovery_required']);
        $this->client->inspectResponse = [
            'sessionId' => $session->worker_session_id,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => true,
                'downloads' => false,
                'uploads' => false,
            ],
            'stateVersion' => (int) $session->worker_state_version,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'recovery_required');

        $this->assertDatabaseHas('talos_browser_sessions', [
            'id' => $session->id,
            'status' => 'recovery_required',
        ]);
    }

    public function test_show_invalidates_a_session_when_the_worker_lacks_interactive_hmi_capabilities(): void
    {
        $session = $this->createSession();
        $this->client->inspectResponse = [
            'sessionId' => $session->worker_session_id,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => false,
                'downloads' => false,
                'uploads' => false,
            ],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];

        $this->getJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonMissing(['interact']);

        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'session.capability_contract_stale',
        ]);
    }

    public function test_browser_session_creation_rejects_a_foreign_chat_before_worker_dispatch(): void
    {
        $foreignChat = TalosSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Foreign chat',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);

        $this->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $foreignChat->id,
        ])->assertNotFound()->assertJsonPath('code', 'TALOS_BROWSER_CHAT_UNAVAILABLE');

        $this->assertSame([], $this->client->requests);
        $this->assertDatabaseCount('talos_browser_sessions', 0);
    }

    public function test_browser_session_creation_rejects_a_mismatched_chat_scope_header_before_worker_dispatch(): void
    {
        $otherChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other request scope',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $this->withHeader('X-Talos-Session-Id', $otherChat->id);

        $this->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $this->chatSession->id,
        ])->assertNotFound()->assertJsonPath('code', 'TALOS_BROWSER_CHAT_UNAVAILABLE');

        $this->assertSame([], $this->client->requests);
        $this->assertDatabaseCount('talos_browser_sessions', 0);
    }

    public function test_same_user_cannot_access_browser_resources_through_another_chat_scope(): void
    {
        $session = $this->createSession();
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $session->id,
            'user_id' => $this->user->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'browser/cross-chat.json',
            'metadata' => [],
        ]);
        $otherChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other chat scope',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $this->withHeader('X-Talos-Session-Id', $otherChat->id);

        foreach ([
            "/api/talos/browser/sessions/{$session->id}",
            "/api/talos/browser/sessions/{$session->id}/events",
            "/api/talos/browser/artifacts/{$artifact->id}",
            "/api/talos/browser/artifacts/{$artifact->id}/preview",
        ] as $route) {
            $this->getJson($route)->assertNotFound()->assertJsonPath('code', 'TALOS_BROWSER_NOT_FOUND');
        }
        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])->assertNotFound();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")->assertNotFound();
        $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")->assertNotFound();
        $this->deleteJson("/api/talos/browser/sessions/{$session->id}")->assertNotFound();

        $this->assertCount(1, $this->client->requests);
        $this->assertSame('ready', $session->fresh()->status);
    }

    public function test_foreign_users_get_not_found_for_every_browser_session_event_and_artifact_route(): void
    {
        $session = $this->createSession();
        $artifact = TalosBrowserArtifact::query()->create(['browser_session_id' => $session->id, 'user_id' => $this->user->id, 'type' => 'snapshot', 'mime' => 'application/json', 'storage_disk' => 'local', 'storage_path' => 'browser/foreign.json', 'metadata' => []]);
        $foreign = User::factory()->create();
        $this->actingAs($foreign);

        foreach (["/api/talos/browser/sessions/{$session->id}", "/api/talos/browser/sessions/{$session->id}/events", "/api/talos/browser/artifacts/{$artifact->id}", "/api/talos/browser/artifacts/{$artifact->id}/preview"] as $route) {
            $this->getJson($route)->assertNotFound();
        }
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

    public function test_recovery_required_blocks_legacy_browser_commands_before_worker_dispatch(): void
    {
        $session = $this->createSession();
        $session->update(['status' => 'recovery_required']);
        $this->client->requests = [];

        foreach ([
            ['navigate', ['url' => 'https://example.com']],
            ['screenshot', []],
            ['snapshot', []],
        ] as [$operation, $payload]) {
            $this->postJson("/api/talos/browser/sessions/{$session->id}/{$operation}", $payload)
                ->assertConflict()
                ->assertJsonPath('code', 'TALOS_BROWSER_INVALID_STATE')
                ->assertJsonPath('details.status', 'recovery_required');
        }

        $this->assertSame([], $this->client->requests);
    }

    public function test_navigation_records_events_and_updates_current_page(): void
    {
        $session = $this->createSession();
        $this->client->navigateResponse = ['url' => 'https://example.com', 'title' => 'Example page', 'status' => 'active', 'stateVersion' => 4];
        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])
            ->assertOk()->assertJsonPath('data.current_url', 'https://example.com')->assertJsonPath('data.current_title', 'Example page')->assertJsonPath('data.state_version', 4);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $session->id, 'type' => 'navigation.requested']);
        $this->assertDatabaseHas('talos_browser_events', ['browser_session_id' => $session->id, 'type' => 'navigation.completed']);
    }

    public function test_legacy_navigation_uses_exact_source_state_compare_and_swap(): void
    {
        $session = $this->createSession();
        $this->client->navigateResponse = [
            'url' => 'https://example.com',
            'title' => 'Late example response',
            'status' => 'active',
            'stateVersion' => 1,
        ];
        $this->client->afterRequest = static function (string $method) use ($session): void {
            if ($method === 'navigate') {
                TalosBrowserSession::query()->whereKey($session->id)->update([
                    'worker_state_version' => 1,
                    'current_title' => 'Concurrent browser operation',
                ]);
            }
        };

        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_STALE_STATE');

        $this->assertSame('Concurrent browser operation', $session->fresh()->current_title);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'navigation.completed',
        ]);
    }

    public function test_screenshot_is_private_and_owner_preview_returns_png_without_paths_or_base64(): void
    {
        $session = $this->createSession();
        $response = $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")->assertCreated()->assertJsonPath('data.mime', 'image/png')->assertJsonMissingPath('data.storage_path')->assertJsonMissingPath('data.base64');
        $artifactId = $response->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
        $previewResponse = $this->get("/api/talos/browser/artifacts/{$artifactId}/preview")
            ->assertOk()
            ->assertHeader('content-type', 'image/png');
        $cacheControl = (string) $previewResponse->headers->get('Cache-Control');
        $this->assertStringContainsString('private', $cacheControl);
        $this->assertStringContainsString('no-cache', $cacheControl);
        $this->assertStringContainsString('must-revalidate', $cacheControl);
        $this->assertStringNotContainsString('no-store', $cacheControl);
        $event = TalosBrowserEvent::query()->where('browser_session_id', $session->id)->where('type', 'screenshot.captured')->firstOrFail();
        $this->assertSame('screenshot', $event->payload['operation'] ?? null);
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', (string) ($event->payload['command_id'] ?? ''));
        $this->assertSame([$artifactId], $event->payload['artifact_ids'] ?? null);
    }

    public function test_direct_screenshot_rejects_binary_evidence_above_five_megabytes_without_persisting_it(): void
    {
        $session = $this->createSession();
        $bytes = str_repeat('x', 5_000_001);
        $this->client->screenshotResponse = [
            'mime' => 'image/png',
            'width' => 1280,
            'height' => 800,
            'base64' => base64_encode($bytes),
            'sha256' => hash('sha256', $bytes),
        ];

        $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")
            ->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');

        $this->assertDatabaseCount('talos_browser_artifacts', 0);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'screenshot.captured',
        ]);
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

    public function test_deleting_an_owned_chat_removes_browser_artifact_rows_and_files(): void
    {
        $browserSession = $this->createSession();
        $screenshotId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $snapshotId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/snapshot")
            ->assertCreated()
            ->json('data.id');

        $screenshot = TalosBrowserArtifact::query()->findOrFail($screenshotId);
        $snapshot = TalosBrowserArtifact::query()->findOrFail($snapshotId);
        $this->assertTrue(Storage::disk('local')->exists($screenshot->storage_path));
        $this->assertTrue(Storage::disk('local')->exists($snapshot->storage_path));

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_sessions', ['id' => $browserSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $screenshot->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $snapshot->id]);
        $this->assertFalse(Storage::disk('local')->exists($screenshot->storage_path));
        $this->assertFalse(Storage::disk('local')->exists($snapshot->storage_path));
    }

    public function test_owned_chat_cleanup_preserves_same_users_other_chat_artifacts(): void
    {
        $otherChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other owned chat',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $otherBrowserSession = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'talos_session_id' => $otherChat->id,
            'worker_session_id' => 'other-owned-worker',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['snapshot'],
            'policy' => [],
        ]);
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $otherBrowserSession->id,
            'user_id' => $this->user->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'talos/browser/other-chat/snapshot.json',
            'metadata' => [],
        ]);
        Storage::disk('local')->put($artifact->storage_path, '{}');

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $this->assertDatabaseHas('talos_sessions', ['id' => $otherChat->id]);
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $otherBrowserSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
    }

    public function test_missing_owned_artifact_file_is_idempotent_during_chat_cleanup(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        Storage::disk('local')->delete($artifact->storage_path);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
    }

    public function test_foreign_chat_deletion_is_denied_without_removing_its_browser_artifact(): void
    {
        $foreignUser = User::factory()->create();
        $foreignChat = TalosSession::query()->create([
            'user_id' => $foreignUser->id,
            'title' => 'Foreign chat with browser evidence',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $foreignBrowserSession = TalosBrowserSession::query()->create([
            'user_id' => $foreignUser->id,
            'talos_session_id' => $foreignChat->id,
            'worker_session_id' => 'foreign-worker',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['snapshot'],
            'policy' => [],
        ]);
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $foreignBrowserSession->id,
            'user_id' => $foreignUser->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'talos/browser/foreign/chat-snapshot.json',
            'metadata' => [],
        ]);
        Storage::disk('local')->put($artifact->storage_path, '{}');

        $this->deleteJson("/api/talos/sessions/{$foreignChat->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('talos_sessions', ['id' => $foreignChat->id, 'user_id' => $foreignUser->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
    }

    public function test_artifact_cleanup_failure_returns_a_generic_error_and_preserves_rows_and_files(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $disk = \Mockery::mock(Storage::disk('local'))->makePartial();
        $disk->shouldReceive('move')->once()->andThrow(new \RuntimeException('quarantine move failed'));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJson([
                'code' => 'TALOS_SESSION_DELETE_FAILED',
                'message' => 'Chat session could not be deleted.',
                'details' => [],
            ])
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $browserSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
    }

    public function test_partial_artifact_cleanup_failure_restores_files_and_preserves_rows(): void
    {
        $browserSession = $this->createSession();
        $firstId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $secondId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        $first = TalosBrowserArtifact::query()->findOrFail($firstId);
        $second = TalosBrowserArtifact::query()->findOrFail($secondId);
        $realDisk = Storage::disk('local');
        $deleteCalls = 0;
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->times(3)->andReturnUsing(function (string $from, string $to) use ($realDisk, &$deleteCalls): bool {
            $deleteCalls++;

            if ($deleteCalls === 2) {
                throw new \RuntimeException('quarantine move failed');
            }

            return $realDisk->move($from, $to);
        });
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJson([
                'code' => 'TALOS_SESSION_DELETE_FAILED',
                'message' => 'Chat session could not be deleted.',
                'details' => [],
            ])
            ->assertJsonMissing(['storage_path']);

        $this->assertSame(3, $deleteCalls);
        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $browserSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $first->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $second->id]);
        $this->assertTrue(Storage::disk('local')->exists($first->storage_path));
        $this->assertTrue(Storage::disk('local')->exists($second->storage_path));
    }

    public function test_false_quarantine_move_with_an_existing_source_fails_closed_and_compensates(): void
    {
        $browserSession = $this->createSession();
        $firstId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $secondId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        $first = TalosBrowserArtifact::query()->findOrFail($firstId);
        $second = TalosBrowserArtifact::query()->findOrFail($secondId);
        $realDisk = Storage::disk('local');
        $moveCalls = 0;
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->times(3)->andReturnUsing(function (string $from, string $to) use ($realDisk, &$moveCalls): bool {
            $moveCalls++;

            if ($moveCalls === 2) {
                return false;
            }

            return $realDisk->move($from, $to);
        });
        $disk->shouldReceive('exists')->andReturnUsing(fn (string $path): bool => $realDisk->exists($path));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED')
            ->assertJsonMissing(['storage_path']);

        $this->assertSame(3, $moveCalls);
        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $first->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $second->id]);
        $this->assertTrue($realDisk->exists($first->storage_path));
        $this->assertTrue($realDisk->exists($second->storage_path));
    }

    public function test_false_quarantine_move_with_a_missing_source_is_idempotent(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $realDisk = Storage::disk('local');
        $realDisk->delete($artifact->storage_path);
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->once()->andReturn(false);
        $disk->shouldReceive('exists')->twice()->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertFalse($realDisk->exists($artifact->storage_path));
    }

    public function test_false_quarantine_move_with_destination_present_is_finalized_as_moved(): void
    {
        $browserSession = $this->createSession();
        $artifact = $this->createStoredArtifact($browserSession, 1);
        $realDisk = Storage::disk('local');
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->once()->andReturnUsing(function (string $from, string $to) use ($realDisk): bool {
            $this->assertTrue($realDisk->move($from, $to));

            return false;
        });
        $disk->shouldReceive('exists')->andReturnUsing(fn (string $path): bool => $realDisk->exists($path));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertSame([], array_values(array_filter($realDisk->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/'))));
    }

    public function test_false_quarantine_delete_after_commit_returns_no_content_and_persists_an_audit_fault(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $realDisk = Storage::disk('local');
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->once()->andReturnUsing(fn (string $from, string $to): bool => $realDisk->move($from, $to));
        $disk->shouldReceive('delete')->andReturn(false);
        $disk->shouldReceive('exists')->andReturnUsing(fn (string $path): bool => $realDisk->exists($path));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertNoContent();

        $quarantineFiles = array_values(array_filter($realDisk->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/')));
        $this->assertGreaterThanOrEqual(2, count($quarantineFiles));
        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.deferred',
            'subject_type' => 'talos_session',
            'subject_id' => $this->chatSession->id,
        ]);
        $this->assertFalse($realDisk->exists($artifact->storage_path));
    }

    public function test_false_delete_with_a_missing_file_is_idempotent(): void
    {
        $disk = \Mockery::mock(Storage::disk('local'))->makePartial();
        $disk->shouldReceive('delete')->twice()->andReturn(false);
        $disk->shouldReceive('exists')->twice()->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        app(TalosBrowserArtifactStore::class)->finalize([[
            'disk' => 'local',
            'path' => 'artifact',
            'quarantine_path' => 'missing-quarantine',
            'manifest_path' => 'missing-manifest',
            'moved' => true,
        ]]);

        $this->assertTrue(true);
    }

    public function test_restore_attempts_every_receipt_entry_and_reports_aggregate_failure(): void
    {
        $attempts = 0;
        $disk = \Mockery::mock(Storage::disk('local'))->makePartial();
        $disk->shouldReceive('move')->times(3)->andReturnUsing(function () use (&$attempts): bool {
            $attempts++;

            if ($attempts === 2) {
                throw new \RuntimeException('second restore move failed');
            }

            return true;
        });
        $disk->shouldReceive('delete')->andReturn(true);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $receipt = [
            ['disk' => 'local', 'path' => 'artifact-1', 'quarantine_path' => 'quarantine-1', 'manifest_path' => 'manifest'],
            ['disk' => 'local', 'path' => 'artifact-2', 'quarantine_path' => 'quarantine-2', 'manifest_path' => 'manifest'],
            ['disk' => 'local', 'path' => 'artifact-3', 'quarantine_path' => 'quarantine-3', 'manifest_path' => 'manifest'],
        ];

        try {
            app(TalosBrowserArtifactStore::class)->restore($receipt);
            $this->fail('A failed restore must report an aggregate failure.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('1 entr', $exception->getMessage());
        }

        $this->assertSame(3, $attempts);
    }

    public function test_restore_is_idempotent_when_quarantine_is_missing_but_destination_exists(): void
    {
        $disk = Storage::disk('local');
        $destination = 'talos/browser/restored-artifact';
        $manifest = 'talos/browser/restored-manifest.json';
        $disk->put($destination, 'restored');
        $disk->put($manifest, '{}');

        app(TalosBrowserArtifactStore::class)->restore([[
            'disk' => 'local',
            'path' => $destination,
            'quarantine_path' => 'talos/browser/missing-quarantine',
            'manifest_path' => $manifest,
            'moved' => true,
        ]]);

        $this->assertSame('restored', $disk->get($destination));
        $this->assertFalse($disk->exists($manifest));
    }

    public function test_restore_faults_when_both_quarantine_and_destination_are_missing(): void
    {
        $disk = Storage::disk('local');
        $manifest = 'talos/browser/missing-restore-manifest.json';
        $disk->put($manifest, '{}');

        try {
            app(TalosBrowserArtifactStore::class)->restore([[
                'disk' => 'local',
                'path' => 'talos/browser/missing-destination',
                'quarantine_path' => 'talos/browser/missing-quarantine',
                'manifest_path' => $manifest,
                'moved' => true,
            ]]);
            $this->fail('Restoring two missing files must report a fault.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('both quarantine and destination are missing', $exception->getPrevious()?->getMessage() ?? $exception->getMessage());
        }

        $this->assertTrue($disk->exists($manifest));
    }

    public function test_cleanup_receipt_contains_bounded_metadata_without_artifact_contents(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $largeContents = str_repeat('x', 5_000_000);
        Storage::disk('local')->put($artifact->storage_path, $largeContents);

        $receipt = DB::transaction(function () use ($largeContents): array {
            $session = TalosSession::query()->whereKey($this->chatSession->id)->lockForUpdate()->firstOrFail();
            $metadata = is_array($session->metadata) ? $session->metadata : [];
            $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
            $session->update(['metadata' => $metadata]);

            $receipt = app(TalosBrowserArtifactStore::class)->deleteForChat($session);
            $this->assertNotSame('', $largeContents);
            app(TalosBrowserArtifactStore::class)->restore($receipt);
            unset($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY]);
            $session->update(['metadata' => $metadata]);

            return $receipt;
        });

        $this->assertCount(1, $receipt);
        $this->assertArrayNotHasKey('contents', $receipt[0]);
        $this->assertLessThan(10_000, strlen(json_encode($receipt, JSON_THROW_ON_ERROR)));
    }

    public function test_cleanup_uses_bounded_batch_manifests(): void
    {
        $browserSession = $this->createSession();
        for ($index = 0; $index < 26; $index++) {
            $this->createStoredArtifact($browserSession, $index);
        }

        $receipt = DB::transaction(function (): array {
            $session = TalosSession::query()->whereKey($this->chatSession->id)->lockForUpdate()->firstOrFail();
            $receipt = app(TalosBrowserArtifactStore::class)->deleteForChat($session);
            app(TalosBrowserArtifactStore::class)->restore($receipt);
            $metadata = is_array($session->metadata) ? $session->metadata : [];
            unset($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY]);
            $session->update(['metadata' => $metadata]);

            return $receipt;
        });

        $batchSizes = array_count_values(array_column($receipt, 'manifest_path'));
        $this->assertCount(2, $batchSizes);
        $this->assertLessThanOrEqual(25, max($batchSizes));
        $this->assertCount(26, $receipt);
    }

    public function test_cleanup_faults_before_any_move_when_artifact_limit_is_exceeded(): void
    {
        $browserSession = $this->createSession();
        for ($index = 0; $index < 101; $index++) {
            $this->createStoredArtifact($browserSession, $index);
        }
        $filesBefore = Storage::disk('local')->allFiles();

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED')
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseCount('talos_browser_artifacts', 101);
        $this->assertSame($filesBefore, Storage::disk('local')->allFiles());
    }

    public function test_artifact_store_prevents_a_chat_from_exceeding_the_cleanup_limit(): void
    {
        $browserSession = $this->createSession();
        for ($index = 0; $index < TalosBrowserArtifactStore::MAX_CLEANUP_ARTIFACTS; $index++) {
            $this->createStoredArtifact($browserSession, $index);
        }
        $filesBefore = Storage::disk('local')->allFiles();

        try {
            app(TalosBrowserArtifactStore::class)->store(
                $browserSession,
                'snapshot',
                'application/json',
                '{"over_limit":true}',
            );
            $this->fail('Artifact creation must stop before a chat becomes impossible to clean up.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('limit', strtolower($exception->getMessage()));
        }

        $this->assertDatabaseCount('talos_browser_artifacts', TalosBrowserArtifactStore::MAX_CLEANUP_ARTIFACTS);
        $this->assertSame($filesBefore, Storage::disk('local')->allFiles());
    }

    public function test_reconciler_releases_a_preflight_marker_when_no_journal_was_created(): void
    {
        $metadata = is_array($this->chatSession->metadata) ? $this->chatSession->metadata : [];
        $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
        $this->chatSession->update(['metadata' => $metadata]);

        $result = app(TalosBrowserArtifactReconciler::class)->reconcileForSession(
            (string) $this->chatSession->id,
            (int) $this->chatSession->user_id,
        );

        $this->assertSame('released', $result['outcome']);
        $freshMetadata = TalosSession::query()->findOrFail($this->chatSession->id)->metadata;
        $this->assertFalse($freshMetadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);
    }

    public function test_reconciler_recovers_a_partial_pre_move_manifest_when_unjournaled_files_are_intact(): void
    {
        $browserSession = $this->createSession();
        $journaled = $this->createStoredArtifact($browserSession, 1);
        $unjournaled = $this->createStoredArtifact($browserSession, 2);
        $operationId = (string) str()->uuid();
        $manifestPath = TalosBrowserArtifactStore::manifestPath(
            (int) $this->user->id,
            (string) $this->chatSession->id,
            $operationId,
            1,
        );
        $quarantinePath = TalosBrowserArtifactStore::quarantinePath(
            (int) $this->user->id,
            (string) $this->chatSession->id,
            $operationId,
            1,
            (string) $journaled->id,
        );
        Storage::disk('local')->put($manifestPath, json_encode([
            'schema' => 'talos_browser_artifact_cleanup',
            'version' => TalosBrowserArtifactStore::JOURNAL_VERSION,
            'operation_id' => $operationId,
            'batch' => 1,
            'session_id' => (string) $this->chatSession->id,
            'user_id' => (int) $this->user->id,
            'entry_count' => 1,
            'entries' => [[
                'artifact_id' => (string) $journaled->id,
                'browser_session_id' => (string) $browserSession->id,
                'disk' => TalosBrowserArtifactStore::LOCAL_DISK,
                'path' => (string) $journaled->storage_path,
                'quarantine_path' => $quarantinePath,
            ]],
        ], JSON_THROW_ON_ERROR));
        $metadata = is_array($this->chatSession->metadata) ? $this->chatSession->metadata : [];
        $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
        $this->chatSession->update(['metadata' => $metadata]);

        $result = app(TalosBrowserArtifactReconciler::class)->reconcileForSession(
            (string) $this->chatSession->id,
            (int) $this->user->id,
        );

        $this->assertSame('restored', $result['outcome']);
        $this->assertTrue(Storage::disk('local')->exists((string) $journaled->storage_path));
        $this->assertTrue(Storage::disk('local')->exists((string) $unjournaled->storage_path));
        $this->assertFalse(Storage::disk('local')->exists($manifestPath));
        $freshMetadata = TalosSession::query()->findOrFail($this->chatSession->id)->metadata;
        $this->assertFalse($freshMetadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);
    }

    public function test_reconciler_fails_closed_when_partial_manifest_has_a_missing_unjournaled_file(): void
    {
        $browserSession = $this->createSession();
        $journaled = $this->createStoredArtifact($browserSession, 1);
        $unjournaled = $this->createStoredArtifact($browserSession, 2);
        $operationId = (string) str()->uuid();
        $manifestPath = TalosBrowserArtifactStore::manifestPath(
            (int) $this->user->id,
            (string) $this->chatSession->id,
            $operationId,
            1,
        );
        $quarantinePath = TalosBrowserArtifactStore::quarantinePath(
            (int) $this->user->id,
            (string) $this->chatSession->id,
            $operationId,
            1,
            (string) $journaled->id,
        );
        Storage::disk('local')->put($manifestPath, json_encode([
            'schema' => 'talos_browser_artifact_cleanup',
            'version' => TalosBrowserArtifactStore::JOURNAL_VERSION,
            'operation_id' => $operationId,
            'batch' => 1,
            'session_id' => (string) $this->chatSession->id,
            'user_id' => (int) $this->user->id,
            'entry_count' => 1,
            'entries' => [[
                'artifact_id' => (string) $journaled->id,
                'browser_session_id' => (string) $browserSession->id,
                'disk' => TalosBrowserArtifactStore::LOCAL_DISK,
                'path' => (string) $journaled->storage_path,
                'quarantine_path' => $quarantinePath,
            ]],
        ], JSON_THROW_ON_ERROR));
        Storage::disk('local')->delete((string) $unjournaled->storage_path);

        $metadata = is_array($this->chatSession->metadata) ? $this->chatSession->metadata : [];
        $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
        $this->chatSession->update(['metadata' => $metadata]);

        try {
            app(TalosBrowserArtifactReconciler::class)->reconcileForSession(
                (string) $this->chatSession->id,
                (int) $this->user->id,
            );
            $this->fail('A partial journal cannot be reconciled when unjournaled content is missing.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('Unjournaled browser artifact content is missing', $exception->getMessage());
        }

        $this->assertTrue(Storage::disk('local')->exists($manifestPath));
        $this->assertTrue(Storage::disk('local')->exists((string) $journaled->storage_path));
        $freshMetadata = TalosSession::query()->findOrFail($this->chatSession->id)->metadata;
        $this->assertTrue($freshMetadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.reconcile_failed',
            'subject_id' => (string) $this->chatSession->id,
        ]);
    }

    public function test_reconciler_restores_valid_batches_and_preserves_unreferenced_quarantine(): void
    {
        $browserSession = $this->createSession();
        $artifact = $this->createStoredArtifact($browserSession, 1);
        $receipt = DB::transaction(function (): array {
            $session = TalosSession::query()->whereKey($this->chatSession->id)->lockForUpdate()->firstOrFail();

            return app(TalosBrowserArtifactStore::class)->deleteForChat($session);
        });
        $orphanPath = dirname($receipt[0]['quarantine_path']).'/unreferenced-orphan';
        Storage::disk('local')->put($orphanPath, 'orphan');

        $result = app(TalosBrowserArtifactReconciler::class)->reconcileForSession(
            (string) $this->chatSession->id,
            (int) $this->user->id,
        );

        $this->assertSame('restored', $result['outcome']);
        $this->assertSame(1, $result['entries']);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
        $this->assertTrue(Storage::disk('local')->exists($orphanPath));
        $this->assertFalse(Storage::disk('local')->exists($receipt[0]['manifest_path']));
        $metadata = TalosSession::query()->findOrFail($this->chatSession->id)->metadata;
        $this->assertFalse($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.reconciled',
            'subject_id' => $this->chatSession->id,
        ]);
    }

    public function test_reconcile_command_finalizes_valid_batches_for_a_deleted_chat(): void
    {
        $browserSession = $this->createSession();
        $artifact = $this->createStoredArtifact($browserSession, 1);
        $receipt = DB::transaction(function (): array {
            $session = TalosSession::query()->whereKey($this->chatSession->id)->lockForUpdate()->firstOrFail();
            $receipt = app(TalosBrowserArtifactStore::class)->deleteForChat($session);
            $this->assertTrue($session->delete());

            return $receipt;
        });

        $this->artisan('talos:browser-artifacts:reconcile')
            ->assertSuccessful();

        $this->assertDatabaseMissing('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertFalse(Storage::disk('local')->exists($receipt[0]['path']));
        $this->assertFalse(Storage::disk('local')->exists($receipt[0]['quarantine_path']));
        $this->assertFalse(Storage::disk('local')->exists($receipt[0]['manifest_path']));
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.reconciled',
            'subject_id' => $this->chatSession->id,
        ]);
    }

    public function test_browser_artifact_reconciliation_is_registered_in_the_scheduler(): void
    {
        $this->artisan('schedule:list')
            ->expectsOutputToContain('talos:browser-artifacts:reconcile')
            ->assertSuccessful();
    }

    public function test_reconcile_command_fails_closed_and_preserves_invalid_manifest_and_orphan(): void
    {
        $operationId = (string) str()->uuid();
        $root = "talos/browser/.quarantine/{$this->user->id}/{$this->chatSession->id}/{$operationId}";
        $manifestPath = "{$root}/batch-0001.json";
        $orphanPath = "{$root}/unreferenced-orphan";
        Storage::disk('local')->put($manifestPath, '{invalid-json');
        Storage::disk('local')->put($orphanPath, 'orphan');
        $metadata = is_array($this->chatSession->metadata) ? $this->chatSession->metadata : [];
        $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
        $this->chatSession->update(['metadata' => $metadata]);

        $this->artisan('talos:browser-artifacts:reconcile')
            ->assertFailed();

        $this->assertTrue(Storage::disk('local')->exists($manifestPath));
        $this->assertTrue(Storage::disk('local')->exists($orphanPath));
        $freshMetadata = TalosSession::query()->findOrFail($this->chatSession->id)->metadata;
        $this->assertTrue($freshMetadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.reconcile_failed',
            'subject_id' => $this->chatSession->id,
        ]);
    }

    public function test_artifact_creation_during_chat_cleanup_is_rejected_before_file_write(): void
    {
        $browserSession = $this->createSession();
        $existingArtifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $filesBefore = Storage::disk('local')->allFiles();
        $artifactCountBefore = TalosBrowserArtifact::query()->count();
        $store = app(TalosBrowserArtifactStore::class);

        DB::transaction(function () use ($browserSession, $store): void {
            $session = TalosSession::query()->whereKey($this->chatSession->id)->lockForUpdate()->firstOrFail();
            $receipt = $store->deleteForChat($session);

            try {
                $store->store($browserSession, 'snapshot', 'application/json', '{"created_after_cleanup_snapshot":true}');
                $this->fail('Artifact creation must be rejected while chat cleanup is pending.');
            } catch (\RuntimeException $exception) {
                $this->assertStringContainsString('cleanup', strtolower($exception->getMessage()));
            }

            $store->restore($receipt);
        });

        $this->assertSame($artifactCountBefore, TalosBrowserArtifact::query()->count());
        $this->assertSame($filesBefore, Storage::disk('local')->allFiles());
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $existingArtifactId]);
    }

    public function test_database_delete_failure_restores_all_quarantined_artifacts(): void
    {
        $browserSession = $this->createSession();
        $firstId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $secondId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        $first = TalosBrowserArtifact::query()->findOrFail($firstId);
        $second = TalosBrowserArtifact::query()->findOrFail($secondId);
        $sessionId = $this->chatSession->id;

        TalosSession::deleting(static function (TalosSession $candidate) use ($sessionId): ?bool {
            return $candidate->id === $sessionId ? false : null;
        });

        $this->deleteJson("/api/talos/sessions/{$sessionId}")
            ->assertStatus(500)
            ->assertJson([
                'code' => 'TALOS_SESSION_DELETE_FAILED',
                'message' => 'Chat session could not be deleted.',
                'details' => [],
            ])
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $sessionId]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $first->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $second->id]);
        $this->assertTrue(Storage::disk('local')->exists($first->storage_path));
        $this->assertTrue(Storage::disk('local')->exists($second->storage_path));
        $this->assertSame([], array_values(array_filter(Storage::disk('local')->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/'))));
    }

    public function test_compensation_failure_persists_cleanup_pending_and_blocks_new_artifacts(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $sessionId = $this->chatSession->id;
        $realDisk = Storage::disk('local');
        $moveCalls = 0;
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->twice()->andReturnUsing(function (string $from, string $to) use ($realDisk, &$moveCalls): bool {
            $moveCalls++;

            if ($moveCalls === 2) {
                throw new \RuntimeException('restore move failed');
            }

            return $realDisk->move($from, $to);
        });
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        TalosSession::deleting(static function (TalosSession $candidate) use ($sessionId): ?bool {
            return $candidate->id === $sessionId ? false : null;
        });

        $this->deleteJson("/api/talos/sessions/{$sessionId}")
            ->assertStatus(500)
            ->assertJson([
                'code' => 'TALOS_SESSION_DELETE_FAILED',
                'message' => 'Chat session could not be deleted.',
                'details' => [],
            ])
            ->assertJsonMissing(['storage_path']);

        $quarantineFiles = array_values(array_filter($realDisk->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/')));
        $this->assertGreaterThanOrEqual(2, count($quarantineFiles));
        $this->assertDatabaseHas('talos_sessions', ['id' => $sessionId]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertFalse($realDisk->exists($artifact->storage_path));
        $metadata = TalosSession::query()->findOrFail($sessionId)->metadata;
        $this->assertTrue($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false);

        try {
            app(TalosBrowserArtifactStore::class)->store($browserSession, 'snapshot', 'application/json', '{}');
            $this->fail('Artifact writes must remain blocked until cleanup reconciliation succeeds.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('cleanup', strtolower($exception->getMessage()));
        }

        $this->assertDatabaseCount('talos_browser_artifacts', 1);
    }

    public function test_delete_retry_reconciles_pending_journal_before_starting_new_cleanup(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $sessionId = $this->chatSession->id;
        $realDisk = Storage::disk('local');
        $moveCalls = 0;
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('move')->times(4)->andReturnUsing(function (string $from, string $to) use ($realDisk, &$moveCalls): bool {
            $moveCalls++;

            if ($moveCalls === 2) {
                throw new \RuntimeException('first compensation move failed');
            }

            return $realDisk->move($from, $to);
        });
        $disk->shouldReceive('exists')->andReturnUsing(fn (string $path): bool => $realDisk->exists($path));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        $deleteAttempts = 0;

        TalosSession::deleting(static function (TalosSession $candidate) use ($sessionId, &$deleteAttempts): ?bool {
            if ($candidate->id !== $sessionId) {
                return null;
            }

            $deleteAttempts++;

            return $deleteAttempts === 1 ? false : null;
        });

        $this->deleteJson("/api/talos/sessions/{$sessionId}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED');

        $this->deleteJson("/api/talos/sessions/{$sessionId}")
            ->assertNoContent();

        $this->assertSame(4, $moveCalls);
        $this->assertDatabaseMissing('talos_sessions', ['id' => $sessionId]);
        $this->assertDatabaseMissing('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertSame([], array_values(array_filter($realDisk->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/'))));
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'browser_artifact_cleanup.reconciled',
            'subject_type' => 'talos_session',
            'subject_id' => $sessionId,
        ]);
    }

    public function test_chat_cleanup_fails_closed_for_an_unexpected_artifact_disk(): void
    {
        $browserSession = $this->createSession();
        $localArtifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $unexpected = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browserSession->id,
            'user_id' => $this->user->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 's3',
            'storage_path' => 'talos/browser/unexpected.json',
            'metadata' => [],
        ]);
        $local = TalosBrowserArtifact::query()->findOrFail($localArtifactId);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED')
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $unexpected->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $local->id]);
        $this->assertTrue(Storage::disk('local')->exists($local->storage_path));
    }

    public function test_chat_cleanup_fails_before_moves_for_an_inconsistent_artifact_owner(): void
    {
        $browserSession = $this->createSession();
        $foreignUser = User::factory()->create();
        $artifact = $this->createStoredArtifact($browserSession, 1, (int) $foreignUser->id);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED')
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
        $this->assertSame([], array_values(array_filter(Storage::disk('local')->allFiles(), static fn (string $path): bool => str_contains($path, '.quarantine/'))));
    }

    public function test_chat_cleanup_fails_before_moves_for_an_inconsistent_browser_session_owner(): void
    {
        $foreignUser = User::factory()->create();
        $browserSession = TalosBrowserSession::query()->create([
            'user_id' => $foreignUser->id,
            'talos_session_id' => $this->chatSession->id,
            'worker_session_id' => 'inconsistent-owner-worker',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['snapshot'],
            'policy' => [],
        ]);
        $artifact = $this->createStoredArtifact($browserSession, 1, (int) $foreignUser->id);

        $this->deleteJson("/api/talos/sessions/{$this->chatSession->id}")
            ->assertStatus(500)
            ->assertJsonPath('code', 'TALOS_SESSION_DELETE_FAILED')
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $this->chatSession->id]);
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $browserSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
    }

    public function test_session_delete_veto_returns_a_generic_error_and_restores_artifacts(): void
    {
        $browserSession = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$browserSession->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $sessionId = $this->chatSession->id;

        TalosSession::deleting(static function (TalosSession $candidate) use ($sessionId) {
            if ($candidate->id === $sessionId) {
                return false;
            }
        });

        $this->deleteJson("/api/talos/sessions/{$sessionId}")
            ->assertStatus(500)
            ->assertJson([
                'code' => 'TALOS_SESSION_DELETE_FAILED',
                'message' => 'Chat session could not be deleted.',
                'details' => [],
            ])
            ->assertJsonMissing(['storage_path']);

        $this->assertDatabaseHas('talos_sessions', ['id' => $sessionId]);
        $this->assertDatabaseHas('talos_browser_sessions', ['id' => $browserSession->id]);
        $this->assertDatabaseHas('talos_browser_artifacts', ['id' => $artifact->id]);
        $this->assertTrue(Storage::disk('local')->exists($artifact->storage_path));
    }

    public function test_worker_errors_are_controlled_and_no_destructive_browser_route_exists(): void
    {
        $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is unavailable.');
        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())->assertStatus(503)->assertJsonPath('code', 'TALOS_BROWSER_WORKER_UNAVAILABLE');
        $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker failed.');
        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())->assertStatus(502)->assertJsonPath('code', 'TALOS_BROWSER_WORKER_FAILURE');
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

    public function test_whatwg_normalized_private_final_redirect_is_denied_before_page_state_is_committed(): void
    {
        $session = $this->createSession();
        $this->client->navigateResponse = [
            'url' => 'HTTP://LOCALHOST.:80/private/../latest/meta-data',
            'title' => 'Metadata',
            'status' => 'active',
        ];

        $this->postJson("/api/talos/browser/sessions/{$session->id}/navigate", ['url' => 'https://example.com'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_POLICY_DENIED');

        $session->refresh();
        $this->assertNull($session->current_url);
        $this->assertNull($session->current_title);
        $this->assertSame('ready', $session->status);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'policy.denied',
            'url_after' => 'HTTP://LOCALHOST.:80/private/../latest/meta-data',
        ]);
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

    public function test_close_acquires_a_closing_lease_before_worker_dispatch(): void
    {
        $session = $this->createSession();
        $observedStatus = null;
        $this->client->afterRequest = static function (string $method) use ($session, &$observedStatus): void {
            if ($method === 'close') {
                $observedStatus = $session->fresh()->status;
            }
        };

        $this->deleteJson("/api/talos/browser/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');

        $this->assertSame('closing', $observedStatus);
        $this->assertSame('closed', $session->fresh()->status);
    }

    public function test_close_does_not_dispatch_when_another_request_owns_the_closing_lease(): void
    {
        $session = $this->createSession();
        $session->update(['status' => 'closing']);
        $this->client->requests = [];

        $this->deleteJson("/api/talos/browser/sessions/{$session->id}")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_INVALID_STATE')
            ->assertJsonPath('details.status', 'closing');

        $this->assertSame([], $this->client->requests);
        $this->assertSame('closing', $session->fresh()->status);
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
        $this->postJson('/api/talos/browser/sessions', $this->sessionPayload(['viewport' => ['width' => 1]]))
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

    public function test_fake_browser_client_allocates_unique_real_worker_namespaced_ids(): void
    {
        $first = $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())->assertCreated();
        $second = $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())->assertCreated();

        $firstWorkerSessionId = (string) TalosBrowserSession::query()->findOrFail($first->json('data.id'))->worker_session_id;
        $secondWorkerSessionId = (string) TalosBrowserSession::query()->findOrFail($second->json('data.id'))->worker_session_id;

        $workerSessionPattern = '/^brw_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D';
        $this->assertMatchesRegularExpression($workerSessionPattern, $firstWorkerSessionId);
        $this->assertMatchesRegularExpression($workerSessionPattern, $secondWorkerSessionId);
        $this->assertNotSame($firstWorkerSessionId, $secondWorkerSessionId);
    }

    public function test_browser_session_listing_filters_legacy_capabilities_without_trusting_actions(): void
    {
        $session = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'talos_session_id' => $this->chatSession->id,
            'worker_session_id' => 'legacy-worker-capabilities',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigate', 'actions', 'screenshot', 'download', 'snapshot'],
            'policy' => [],
        ]);

        $this->getJson('/api/talos/browser/sessions?talos_session_id='.$this->chatSession->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $session->id)
            ->assertJsonPath('data.0.capabilities', ['navigate', 'screenshot', 'snapshot']);
    }

    public function test_testing_container_binds_an_isolated_fake_browser_client(): void
    {
        $this->app->forgetInstance(BrowserSessionClient::class);

        $this->assertInstanceOf(FakeBrowserSessionClient::class, $this->app->make(BrowserSessionClient::class));
    }

    public function test_testing_container_can_use_the_real_http_browser_client_for_live_integration_gates(): void
    {
        config()->set('services.talos.browser.client_driver', 'http');
        config()->set('services.talos.browser.worker_url', 'http://127.0.0.1:3110');
        config()->set('services.talos.browser.worker_token', 'integration-worker-token');
        $this->configureEphemeralBrowserActionIssuer();
        $this->app->forgetInstance(BrowserWorkerConfiguration::class);
        $this->app->forgetInstance(BrowserSessionClient::class);

        $this->assertInstanceOf(HttpBrowserSessionClient::class, $this->app->make(BrowserSessionClient::class));
    }

    private function configureEphemeralBrowserActionIssuer(): void
    {
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        $this->assertNotFalse($key);
        $privateKey = '';
        $this->assertTrue(openssl_pkey_export($key, $privateKey));

        config()->set('services.talos.browser.action_private_key_b64', base64_encode($privateKey));
        config()->set('services.talos.browser.action_key_id', 'testing-browser-action-key');
        $this->app->forgetInstance(TalosBrowserActionCapabilityIssuer::class);
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

    public function test_http_browser_client_preserves_a_controlled_worker_fault(): void
    {
        Http::fake([
            'http://browser-worker.test/sessions/worker-1/snapshot' => Http::response([
                'message' => 'Browser snapshot execution failed.',
                'code' => 'TALOS_BROWSER_WORKER_ERROR',
                'details' => ['internal' => 'must not cross the client boundary'],
            ], 500),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        try {
            $client->snapshot('talos-user:1', 'worker-1');
            $this->fail('A failed worker response must throw a typed BrowserWorkerException.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_WORKER_ERROR', $exception->errorCode);
            $this->assertSame('Browser snapshot execution failed.', $exception->getMessage());
        }
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

    public function test_hmi_event_idempotency_migration_is_bounded_and_does_not_trust_historical_payloads(): void
    {
        $source = file_get_contents(database_path('migrations/2026_07_14_000003_add_hmi_event_idempotency_key.php'));

        $this->assertIsString($source);
        $this->assertStringContainsString("\$table->string('command_id', 128)->nullable()", $source);
        $this->assertStringContainsString("['browser_session_id', 'type', 'command_id']", $source);
        $this->assertStringNotContainsString('json_decode($event->payload', $source);
        $this->assertStringNotContainsString('$seen', $source);
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

    public function test_tampered_screenshot_bytes_are_not_served_and_require_recovery(): void
    {
        $session = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$session->id}/screenshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $bytes = Storage::disk($artifact->storage_disk)->get($artifact->storage_path);
        $tampered = ($bytes[0] === 'x' ? 'y' : 'x').substr($bytes, 1);
        Storage::disk($artifact->storage_disk)->put($artifact->storage_path, $tampered);

        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}/preview")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'sha256_mismatch');
        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}/preview")
            ->assertConflict()
            ->assertJsonPath('details.reason', 'sha256_mismatch');

        $this->assertSame('recovery_required', $session->fresh()->status);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $session->id,
            'type' => 'artifact.integrity_failed',
        ]);
        $this->assertSame(1, TalosBrowserEvent::query()
            ->where('browser_session_id', $session->id)
            ->where('type', 'artifact.integrity_failed')
            ->count());
    }

    public function test_snapshot_size_mismatch_is_rejected_before_preview_parsing(): void
    {
        $session = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $bytes = Storage::disk($artifact->storage_disk)->get($artifact->storage_path);
        Storage::disk($artifact->storage_disk)->put($artifact->storage_path, $bytes.' ');

        $this->getJson("/api/talos/browser/artifacts/{$artifact->id}/preview")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'size_mismatch');

        $this->assertSame('recovery_required', $session->fresh()->status);
    }

    public function test_raw_snapshot_preview_is_unavailable_when_the_explicit_development_gate_is_disabled(): void
    {
        $session = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        config(['services.talos.browser.dev_evidence' => false]);

        $this->getJson("/api/talos/browser/artifacts/{$artifactId}/preview")
            ->assertOk()
            ->assertJsonPath('data.preview_available', false)
            ->assertJsonPath('data.reason', 'development_evidence_disabled')
            ->assertJsonMissingPath('data.snapshot')
            ->assertJsonMissingPath('data.nodes');
    }

    public function test_production_environment_blocks_raw_snapshot_preview_even_when_the_flag_is_true(): void
    {
        $session = $this->createSession();
        $artifactId = $this->postJson("/api/talos/browser/sessions/{$session->id}/snapshot")
            ->assertCreated()
            ->json('data.id');
        config(['services.talos.browser.dev_evidence' => true]);
        $originalEnvironment = $this->app['env'];
        $this->app['env'] = 'production';

        try {
            $this->getJson("/api/talos/browser/artifacts/{$artifactId}/preview")
                ->assertOk()
                ->assertJsonPath('data.preview_available', false)
                ->assertJsonMissingPath('data.snapshot');
        } finally {
            $this->app['env'] = $originalEnvironment;
        }
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
        $contents = json_encode(['format' => 'accessibility_refs_v1', 'url' => 'https://example.com', 'title' => 'Example', 'textDigest' => hash('sha256', 'bounded'), 'cookies' => ['secret'], 'body' => str_repeat('x', 10000), 'nodes' => array_fill(0, 250, ['ref' => 'r', 'role' => 'link', 'name' => 'Safe', 'visible' => true, 'unknown' => 'hidden'])], JSON_THROW_ON_ERROR);
        $artifact = app(TalosBrowserArtifactStore::class)->store(
            $session,
            'snapshot',
            'application/json',
            $contents,
        );

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
        $id = $this->postJson('/api/talos/browser/sessions', $this->sessionPayload())->assertCreated()->json('data.id');

        return TalosBrowserSession::query()->findOrFail($id);
    }

    private function createStoredArtifact(TalosBrowserSession $session, int $index, ?int $artifactUserId = null): TalosBrowserArtifact
    {
        $id = (string) str()->uuid();
        $path = "talos/browser/{$session->user_id}/{$session->id}/{$id}";
        $contents = "artifact-{$index}";
        $artifact = TalosBrowserArtifact::query()->create([
            'id' => $id,
            'browser_session_id' => $session->id,
            'user_id' => $artifactUserId ?? $session->user_id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'sha256' => hash('sha256', $contents),
            'metadata' => ['index' => $index],
        ]);
        Storage::disk('local')->put($path, $contents);

        return $artifact;
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function sessionPayload(array $overrides = []): array
    {
        return [
            'talos_session_id' => $this->chatSession->id,
            ...$overrides,
        ];
    }
}
