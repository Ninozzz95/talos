<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserHmiApproval;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosBrowserHmiApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private TalosSession $chat;

    private TalosBrowserSession $browser;

    private TalosBrowserArtifact $frame;

    private FakeBrowserSessionClient $client;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = $this->authenticateTalosUser();
        $this->chat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Interactive browser evidence',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $this->withHeader('X-Talos-Session-Id', $this->chat->id);
        $this->useIsolatedLocalStorage();
        config(['services.talos.browser.hmi_min_mode' => null]);

        $this->browser = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'talos_session_id' => $this->chat->id,
            'worker_session_id' => 'worker-hmi-api',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.com/before',
            'current_title' => 'Before click',
            'viewport_width' => 800,
            'viewport_height' => 600,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => true,
            ],
            'policy' => [],
            'worker_state_version' => 7,
            'expires_at' => now()->addHour(),
            'last_seen_at' => now(),
        ]);
        $this->frame = $this->storeCurrentFrame($this->browser, 7);

        $this->client = new FakeBrowserSessionClient;
        $this->client->preflightPointerResponse = $this->preflight('Reject optional cookies');
        $this->client->executePointerResponse = $this->workerResult();
        $this->app->instance(BrowserSessionClient::class, $this->client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (string $host): array => $host === 'example.com' ? ['93.184.216.34'] : [],
        ));
    }

    public function test_an_ordinary_authenticated_pointer_action_persists_the_resulting_frame_atomically(): void
    {
        $interactionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        $response = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload([
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => $interactionId,
            ]),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('data.interaction.status', 'executed')
            ->assertJsonPath('data.interaction.interaction_id', $interactionId)
            ->assertJsonPath('data.session.state_version', 8)
            ->assertJsonPath('data.session.capabilities', ['navigate', 'screenshot', 'snapshot', 'interact'])
            ->assertJsonPath('data.screenshot.type', 'screenshot')
            ->assertJsonPath('data.screenshot.state_version', 8)
            ->assertJsonPath('data.snapshot.type', 'snapshot')
            ->assertJsonPath('data.snapshot.state_version', 8)
            ->assertJsonPath('data.screenshot.preview_url', "/api/talos/browser/artifacts/{$response->json('data.screenshot.id')}/preview")
            ->assertJsonMissingPath('data.screenshot.storage_path')
            ->assertJsonMissingPath('data.screenshot.base64');

        $this->assertSame(['preflightPointer', 'executePointer'], array_column($this->client->requests, 'method'));
        $this->assertSame('talos-user:'.$this->user->id, $this->client->requests[0]['ownerRef']);
        $this->assertSame('talos_browser_hmi_pointer_v2', $this->client->requests[0]['payload']['schema_version']);
        $this->assertSame($interactionId, $this->client->requests[0]['payload']['interaction_id'] ?? null);
        $this->assertSame('sha256:'.$this->frame->sha256, $this->client->requests[0]['payload']['expected_frame_sha256']);
        $this->assertSame(7, $this->client->requests[1]['payload']['state_version']);
        $this->assertMatchesRegularExpression('/^hmi_[a-f0-9]{64}$/', (string) ($this->client->requests[1]['payload']['command_id'] ?? ''));
        $this->assertSame($interactionId, $this->client->requests[1]['payload']['interaction_id'] ?? null);
        $this->assertSame('ordinary', $this->client->requests[1]['payload']['effect_classification'] ?? null);
        $this->assertFalse($this->client->requests[1]['payload']['sensitive_effect_authorized'] ?? true);
        $this->assertSame($this->preflight()['target']['fingerprint'], $this->client->requests[1]['payload']['expected_fingerprint']);
        $authorization = $this->client->requests[1]['authorization'] ?? null;
        $this->assertInstanceOf(BrowserActionAuthorization::class, $authorization);
        $this->assertSame(
            $this->client->requests[1]['payload']['command_id'],
            $authorization->actionId(),
        );

        $fresh = $this->browser->fresh();
        $this->assertSame(8, $fresh->worker_state_version);
        $this->assertSame($response->json('data.screenshot.id'), $fresh->last_screenshot_artifact_id);
        $this->assertSame($response->json('data.snapshot.id'), $fresh->last_snapshot_artifact_id);
        $this->assertDatabaseCount('talos_browser_artifacts', 3);
        $command = TalosBrowserHmiApproval::query()->sole();
        $this->assertSame([
            'kind' => 'user_approval',
            'approval_id' => (string) $command->id,
            'approval_request_sha256' => (string) $command->request_hash,
            'execution_lease_sha256' => $authorization->toCapabilityAttestation()['execution_lease_sha256'],
        ], $authorization->toCapabilityAttestation());
        $this->assertMatchesRegularExpression(
            '/^sha256:[a-f0-9]{64}$/D',
            $authorization->toCapabilityAttestation()['execution_lease_sha256'],
        );
        $this->assertSame('consumed', $command->status);
        $this->assertSame($interactionId, $command->interaction_id);
        $this->assertSame(1, $command->execution_attempts);
        $this->assertSame($interactionId, $command->execution_payload['interaction_id'] ?? null);
        $this->assertSame(
            $command->id,
            TalosBrowserArtifact::query()->findOrFail($response->json('data.screenshot.id'))->metadata['approval_id'] ?? null,
        );
        foreach (['hmi.pointer.requested', 'hmi.pointer.allowed', 'hmi.pointer.executed', 'hmi.evidence.persisted'] as $type) {
            $this->assertDatabaseHas('talos_browser_events', [
                'browser_session_id' => $this->browser->id,
                'type' => $type,
            ]);
        }
        $evidenceEvent = TalosBrowserEvent::query()->where('browser_session_id', $this->browser->id)->where('type', 'hmi.evidence.persisted')->firstOrFail();
        $this->assertSame('screenshot', $evidenceEvent->payload['operation'] ?? null);
        $this->assertSame($response->json('data.screenshot.id'), $evidenceEvent->payload['screenshot_artifact_id'] ?? null);
        $this->assertSame($response->json('data.snapshot.id'), $evidenceEvent->payload['snapshot_artifact_id'] ?? null);
        $this->assertSame($interactionId, $evidenceEvent->payload['interaction_id'] ?? null);
    }

    public function test_direct_human_public_link_click_executes_once_without_confirmation_and_persists_evidence(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Navigation menu', [
            'tag' => 'a',
            'role' => 'link',
            'href' => 'https://example.com/docs/components/base/navigation-menu',
        ]);

        $response = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload([
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => 'abababab-abab-4bab-8bab-abababababab',
            ]),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('data.interaction.status', 'executed')
            ->assertJsonPath('data.session.status', 'active')
            ->assertJsonPath('data.session.state_version', 8);

        $this->assertSame(['preflightPointer', 'executePointer'], array_column($this->client->requests, 'method'));
        $this->assertSame('ordinary', $this->client->requests[1]['payload']['effect_classification'] ?? null);
        $this->assertFalse($this->client->requests[1]['payload']['sensitive_effect_authorized'] ?? true);
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 1);
        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['status' => 'consumed']);
        $this->assertDatabaseCount('talos_browser_artifacts', 3);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'hmi.recovery_required',
        ]);
    }

    public function test_a_completed_ordinary_command_is_durably_replayed_without_worker_dispatch(): void
    {
        $payload = $this->pointerPayload([
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ]);
        $completed = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )->assertCreated();
        $requestCount = count($this->client->requests);

        $replayed = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )->assertCreated();

        $this->assertSame($completed->json(), $replayed->json());
        $this->assertSame($requestCount, count($this->client->requests));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 1);
        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['status' => 'consumed']);
    }

    public function test_a_consumed_command_is_not_replayed_when_its_evidence_file_is_corrupt(): void
    {
        $payload = $this->pointerPayload([
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc',
        ]);
        $completed = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )->assertCreated();
        $artifact = TalosBrowserArtifact::query()->findOrFail($completed->json('data.screenshot.id'));
        Storage::disk((string) $artifact->storage_disk)->put((string) $artifact->storage_path, 'corrupt');
        $requestCount = count($this->client->requests);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'TALOS_BROWSER_REPLAY_EVIDENCE_INVALID');

        $this->assertSame($requestCount, count($this->client->requests));
        $this->assertSame('recovery_required', $this->browser->fresh()->status);
    }

    public function test_a_stale_execution_lease_reclaims_the_exact_command_after_an_unknown_outcome(): void
    {
        $payload = $this->pointerPayload([
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        ]);
        $this->client->afterRequest = static function (string $method): void {
            if ($method === 'executePointer') {
                throw new \RuntimeException('response lost after worker execution');
            }
        };

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED');

        $command = TalosBrowserHmiApproval::query()->sole();
        $this->assertSame('executing', $command->status);
        $this->assertSame(1, $command->execution_attempts);

        $this->client->afterRequest = null;
        $requestCount = count($this->client->requests);
        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_COMMAND_IN_PROGRESS');
        $this->assertSame($requestCount, count($this->client->requests));

        $command->forceFill([
            'execution_started_at' => now()->subMinutes(5),
            'execution_lease_expires_at' => now()->subSecond(),
        ])->save();

        $recovered = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $payload,
        );
        $recovered
            ->assertCreated()
            ->assertJsonPath('data.interaction.interaction_id', $payload['interaction_id']);

        $command->refresh();
        $this->assertSame('consumed', $command->status);
        $this->assertSame(2, $command->execution_attempts);
        $this->assertSame(2, collect($this->client->requests)->where('method', 'executePointer')->count());
        $this->assertDatabaseCount('talos_browser_artifacts', 3);
    }

    public function test_an_unavailable_pre_dispatch_audit_store_fails_closed_with_a_controlled_error(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER fail_hmi_requested_audit
            BEFORE INSERT ON talos_browser_events
            WHEN NEW.type = 'hmi.pointer.requested'
            BEGIN
                SELECT RAISE(ABORT, 'audit unavailable');
            END
        SQL);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertStatus(503)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_AUDIT_UNAVAILABLE');

        $this->assertSame([], $this->client->requests);
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 0);
    }

    public function test_a_sensitive_target_requires_an_exact_single_use_confirmation_before_execution(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', ['is_submit' => true, 'form_method' => 'post']);

        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertStatus(428)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED')
            ->assertJsonPath('details.action.label', 'Buy now')
            ->assertJsonPath('details.action.origin', 'https://example.com')
            ->assertJsonPath('details.action.category', 'sensitive');

        $approvalId = (string) $challenge->json('details.approval_id');
        $requestHash = (string) $challenge->json('details.request_hash');
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $approvalId);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', $requestHash);
        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['id' => $approvalId, 'status' => 'pending']);
        $requestedEvent = TalosBrowserEvent::query()
            ->where('browser_session_id', $this->browser->id)
            ->where('type', 'hmi.pointer.requested')
            ->firstOrFail();
        $requestedCommandId = (string) ($requestedEvent->payload['command_id'] ?? '');
        $this->assertMatchesRegularExpression('/^hmi_[a-f0-9]{64}$/', $requestedCommandId);

        $this->postJson("/api/talos/browser/interactions/{$approvalId}/confirm", [
            'decision' => 'approve',
            'request_hash' => $requestHash,
        ])
            ->assertCreated()
            ->assertJsonPath('data.interaction.status', 'executed')
            ->assertJsonPath('data.interaction.approval_id', $approvalId)
            ->assertJsonPath('data.session.state_version', 8);

        $this->assertSame(['preflightPointer', 'preflightPointer', 'executePointer'], array_column($this->client->requests, 'method'));
        $this->assertSame($requestedCommandId, $this->client->requests[2]['payload']['command_id'] ?? null);
        $this->assertSame('sensitive', $this->client->requests[2]['payload']['effect_classification'] ?? null);
        $this->assertTrue($this->client->requests[2]['payload']['sensitive_effect_authorized'] ?? false);
        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['id' => $approvalId, 'status' => 'consumed']);

        $this->postJson("/api/talos/browser/interactions/{$approvalId}/confirm", [
            'decision' => 'approve',
            'request_hash' => $requestHash,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_APPROVAL_CONSUMED');
        $this->assertSame(1, collect($this->client->requests)->where('method', 'executePointer')->count());
    }

    public function test_repeating_the_same_sensitive_pointer_reuses_the_existing_challenge(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', [
            'is_submit' => true,
            'form_method' => 'post',
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'sensitive',
        ]);

        $first = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);
        $second = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);

        $this->assertSame($first->json('details.approval_id'), $second->json('details.approval_id'));
        $this->assertSame($first->json('details.request_hash'), $second->json('details.request_hash'));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 1);
    }

    public function test_a_completed_sensitive_command_is_replayed_without_dispatching_the_worker_again(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', [
            'is_submit' => true,
            'form_method' => 'post',
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'sensitive',
        ]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);
        $completed = $this->postJson("/api/talos/browser/interactions/{$challenge->json('details.approval_id')}/confirm", [
            'decision' => 'approve',
            'request_hash' => $challenge->json('details.request_hash'),
        ])->assertCreated();
        $requestCount = count($this->client->requests);

        $replayed = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertCreated()
            ->assertJsonPath('data.interaction.command_id', $completed->json('data.interaction.command_id'))
            ->assertJsonPath('data.screenshot.id', $completed->json('data.screenshot.id'));

        $this->assertSame($completed->json(), $replayed->json());
        $this->assertSame($requestCount, count($this->client->requests));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 1);
    }

    public function test_confirmation_audit_failure_rolls_back_the_execution_claim(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', [
            'is_submit' => true,
            'form_method' => 'post',
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'sensitive',
        ]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER fail_hmi_confirmation_audit
            BEFORE INSERT ON talos_browser_events
            WHEN NEW.type = 'hmi.confirmation.confirmed'
            BEGIN
                SELECT RAISE(ABORT, 'audit unavailable');
            END
        SQL);

        $this->postJson("/api/talos/browser/interactions/{$challenge->json('details.approval_id')}/confirm", [
            'decision' => 'approve',
            'request_hash' => $challenge->json('details.request_hash'),
        ])
            ->assertStatus(503)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CONFIRMATION_COMMIT_FAILED');

        $this->assertDatabaseHas('talos_browser_hmi_approvals', [
            'id' => $challenge->json('details.approval_id'),
            'status' => 'pending',
        ]);
        $this->assertSame(0, collect($this->client->requests)->where('method', 'executePointer')->count());
    }

    public function test_a_proven_pre_dispatch_failure_invalidates_the_execution_claim(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', [
            'is_submit' => true,
            'form_method' => 'post',
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'sensitive',
        ]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);
        $preflightCount = 0;
        $this->client->afterRequest = function (string $method) use (&$preflightCount): void {
            if ($method === 'preflightPointer' && ++$preflightCount === 1) {
                $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_TARGET_STALE', 'Target changed before dispatch.');
            }
        };

        $this->postJson("/api/talos/browser/interactions/{$challenge->json('details.approval_id')}/confirm", [
            'decision' => 'approve',
            'request_hash' => $challenge->json('details.request_hash'),
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TARGET_STALE');

        $this->assertDatabaseHas('talos_browser_hmi_approvals', [
            'id' => $challenge->json('details.approval_id'),
            'status' => 'invalidated',
        ]);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
        $this->assertSame('active', $this->browser->fresh()->status);
    }

    public function test_an_unattestable_ordinary_label_requires_confirmation_before_worker_dispatch(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Reject optional cookies', [
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'sensitive',
        ]);

        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertStatus(428)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED')
            ->assertJsonPath('details.action.category', 'sensitive');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));

        $this->postJson("/api/talos/browser/interactions/{$challenge->json('details.approval_id')}/confirm", [
            'decision' => 'approve',
            'request_hash' => $challenge->json('details.request_hash'),
        ])->assertCreated();

        $execute = $this->client->requests[2]['payload'];
        $this->assertSame('sensitive', $execute['effect_classification'] ?? null);
        $this->assertTrue($execute['sensitive_effect_authorized'] ?? false);
    }

    public function test_stale_or_mismatched_frame_input_is_rejected_before_worker_dispatch(): void
    {
        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(['artifact_sha256' => 'sha256:'.str_repeat('f', 64)]),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_FRAME_STALE');

        $this->assertSame([], $this->client->requests);
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 0);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
    }

    public function test_frame_changed_after_preflight_is_rejected_before_physical_dispatch(): void
    {
        $this->client->afterRequest = function (string $method): void {
            if ($method === 'preflightPointer') {
                $this->storeCurrentFrame($this->browser->fresh(), 7);
            }
        };

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_FRAME_STALE');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
        $this->assertSame('active', $this->browser->fresh()->status);
    }

    public function test_cross_chat_or_foreign_browser_resources_are_not_disclosed(): void
    {
        $foreignUser = User::factory()->create();
        $foreignChat = TalosSession::query()->create([
            'user_id' => $foreignUser->id,
            'title' => 'Foreign',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $foreignBrowser = TalosBrowserSession::query()->create([
            'user_id' => $foreignUser->id,
            'talos_session_id' => $foreignChat->id,
            'worker_session_id' => 'foreign-worker',
            'status' => 'active',
            'mode' => 'read_only',
            'viewport_width' => 800,
            'viewport_height' => 600,
            'capabilities' => ['hmiActions' => true],
            'policy' => [],
            'worker_state_version' => 7,
            'expires_at' => now()->addHour(),
        ]);

        $this->postJson(
            "/api/talos/browser/sessions/{$foreignBrowser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_NOT_FOUND');

        $this->assertSame([], $this->client->requests);
    }

    public function test_tampered_current_frame_enters_recovery_without_worker_dispatch(): void
    {
        $bytes = Storage::disk((string) $this->frame->storage_disk)->get((string) $this->frame->storage_path);
        Storage::disk((string) $this->frame->storage_disk)->put(
            (string) $this->frame->storage_path,
            ($bytes[0] === 'x' ? 'y' : 'x').substr($bytes, 1),
        );

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'sha256_mismatch');

        $this->assertSame('recovery_required', $this->browser->fresh()->status);
        $this->assertSame([], $this->client->requests);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'artifact.integrity_failed',
        ]);
    }

    public function test_a_post_dispatch_worker_failure_is_never_replayed_and_marks_recovery_required(): void
    {
        $this->client->afterRequest = function (string $method): void {
            if ($method === 'preflightPointer') {
                $this->client->failure = new BrowserWorkerException(
                    'TALOS_BROWSER_HMI_RECOVERY_REQUIRED',
                    'The physical effect may have occurred.',
                    ['reason_code' => 'evidence_frame_changed'],
                );
            }
        };

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED');

        $this->assertSame(['preflightPointer', 'executePointer'], array_column($this->client->requests, 'method'));
        $this->assertSame('recovery_required', $this->browser->fresh()->status);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
        $event = TalosBrowserEvent::query()
            ->where('browser_session_id', $this->browser->id)
            ->where('type', 'hmi.recovery_required')
            ->latest()
            ->firstOrFail();
        $this->assertSame('evidence_frame_changed', $event->payload['reason'] ?? null);
    }

    public function test_an_unexpected_execute_exception_enters_recovery_instead_of_leaking_a_500(): void
    {
        $this->client->afterRequest = static function (string $method): void {
            if ($method === 'executePointer') {
                throw new \RuntimeException('transport crashed after dispatch');
            }
        };

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED');

        $this->assertSame('recovery_required', $this->browser->fresh()->status);
    }

    public function test_a_pre_effect_worker_denial_does_not_quarantine_the_session(): void
    {
        $this->client->afterRequest = static function (string $method): void {
            if ($method === 'executePointer') {
                throw new BrowserWorkerException('TALOS_BROWSER_HMI_TARGET_DENIED', 'Target is no longer actionable.');
            }
        };

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertForbidden()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_TARGET_DENIED');

        $this->assertSame('active', $this->browser->fresh()->status);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'hmi.recovery_required',
        ]);
    }

    public function test_execute_result_bound_to_a_different_source_frame_requires_recovery(): void
    {
        $result = $this->workerResult();
        $result['frame_sha256'] = 'sha256:'.str_repeat('f', 64);
        $this->client->executePointerResponse = $result;

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED');

        $this->assertSame('recovery_required', $this->browser->fresh()->status);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
    }

    public function test_a_policy_denied_final_destination_is_recovery_required_and_not_persisted(): void
    {
        $result = $this->workerResult();
        $result['url'] = 'http://127.0.0.1/internal';
        $this->client->executePointerResponse = $result;

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED');

        $this->assertSame('recovery_required', $this->browser->fresh()->status);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'hmi.recovery_required',
        ]);
    }

    public function test_read_only_policy_and_missing_hmi_capability_fail_closed_before_preflight(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['browser_hmi_mode' => 'read_only'],
        ]);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertForbidden()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_POLICY_DENIED')
            ->assertJsonPath('details.mode', 'read_only');
        $this->assertSame([], $this->client->requests);

        TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->delete();
        $this->browser->update(['capabilities' => ['hmiActions' => false]]);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertForbidden()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CAPABILITY_DENIED');
        $this->assertSame([], $this->client->requests);
    }

    public function test_workspace_confirm_every_policy_cannot_be_weakened_by_the_user(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['browser_hmi_mode' => 'confirm_sensitive'],
        ]);
        config(['services.talos.browser.hmi_min_mode' => 'confirm_every_interaction']);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertStatus(428)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED')
            ->assertJsonPath('details.action.category', 'ordinary');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
    }

    public function test_pointer_contract_rejects_coerced_or_unsupported_json_values(): void
    {
        foreach ([
            ['state_version' => '7'],
            ['normalized_x' => '0.25'],
            ['normalized_y' => INF],
            ['click_count' => '1'],
            ['button' => 'right'],
            ['normalized_x' => 1.1],
        ] as $override) {
            $this->postJson(
                "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
                $this->pointerPayload($override),
            )
                ->assertUnprocessable()
                ->assertJsonPath('code', 'TALOS_BROWSER_VALIDATION_FAILED');
        }

        $this->assertSame([], $this->client->requests);
    }

    public function test_confirmation_can_be_explicitly_rejected_without_executing_the_pointer(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Delete account', ['is_submit' => true]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);

        $approvalId = (string) $challenge->json('details.approval_id');
        $this->postJson("/api/talos/browser/interactions/{$approvalId}/confirm", [
            'decision' => 'reject',
            'request_hash' => $challenge->json('details.request_hash'),
        ])
            ->assertOk()
            ->assertJsonPath('data.interaction.status', 'rejected');

        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['id' => $approvalId, 'status' => 'rejected']);
        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
    }

    public function test_confirmation_rejection_rolls_back_when_its_audit_event_cannot_be_written(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Delete account', ['is_submit' => true]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);
        $approvalId = (string) $challenge->json('details.approval_id');

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER fail_hmi_rejection_audit
            BEFORE INSERT ON talos_browser_events
            WHEN NEW.type = 'hmi.confirmation.rejected'
            BEGIN
                SELECT RAISE(ABORT, 'audit unavailable');
            END
        SQL);

        $this->postJson("/api/talos/browser/interactions/{$approvalId}/confirm", [
            'decision' => 'reject',
            'request_hash' => $challenge->json('details.request_hash'),
        ])
            ->assertStatus(503)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_AUDIT_UNAVAILABLE');

        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['id' => $approvalId, 'status' => 'pending']);
    }

    public function test_hmi_event_command_keys_are_unique_at_the_database_boundary(): void
    {
        $attributes = [
            'browser_session_id' => $this->browser->id,
            'user_id' => $this->user->id,
            'type' => 'hmi.pointer.executed',
            'actor' => 'worker',
            'command_id' => 'hmi_'.str_repeat('a', 64),
            'payload' => ['command_id' => 'hmi_'.str_repeat('a', 64)],
        ];
        TalosBrowserEvent::query()->create($attributes);

        $this->expectException(QueryException::class);
        TalosBrowserEvent::query()->create($attributes);
    }

    public function test_a_new_v2_interaction_intent_can_request_confirmation_after_a_rejection(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Delete account', ['is_submit' => true]);
        $firstIntent = $this->pointerPayload([
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => '11111111-1111-4111-8111-111111111111',
        ]);
        $secondIntent = $this->pointerPayload([
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => '22222222-2222-4222-8222-222222222222',
        ]);

        $firstChallenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $firstIntent,
        )->assertStatus(428);
        $this->postJson("/api/talos/browser/interactions/{$firstChallenge->json('details.approval_id')}/confirm", [
            'decision' => 'reject',
            'request_hash' => $firstChallenge->json('details.request_hash'),
        ])->assertOk();

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $firstIntent,
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_APPROVAL_INVALID');

        $secondChallenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $secondIntent,
        )
            ->assertStatus(428)
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED');

        $this->assertNotSame($firstChallenge->json('details.approval_id'), $secondChallenge->json('details.approval_id'));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 2);
        $this->assertSame(['preflightPointer', 'preflightPointer', 'preflightPointer'], array_column($this->client->requests, 'method'));
    }

    public function test_confirmation_rejects_expired_forged_and_changed_challenges_without_execution(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Buy now', ['is_submit' => true]);
        $challenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )->assertStatus(428);
        $approval = TalosBrowserHmiApproval::query()->findOrFail($challenge->json('details.approval_id'));

        $this->postJson("/api/talos/browser/interactions/{$approval->id}/confirm", [
            'decision' => 'approve',
            'request_hash' => 'sha256:'.str_repeat('f', 64),
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_APPROVAL_INVALID');
        $this->assertSame('pending', $approval->fresh()->status);

        $this->client->preflightPointerResponse = $this->preflight('Buy now', [
            'is_submit' => true,
            'fingerprint' => 'sha256:'.str_repeat('b', 64),
        ]);
        $this->postJson("/api/talos/browser/interactions/{$approval->id}/confirm", [
            'decision' => 'approve',
            'request_hash' => $approval->request_hash,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TARGET_STALE');
        $this->assertSame('invalidated', $approval->fresh()->status);
        $this->assertSame(0, collect($this->client->requests)->where('method', 'executePointer')->count());

        $this->client->preflightPointerResponse = $this->preflight('Buy now', ['is_submit' => true]);
        $this->postJson("/api/talos/browser/interactions/{$approval->id}/confirm", [
            'decision' => 'approve',
            'request_hash' => $approval->request_hash,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_APPROVAL_INVALID');

        $freshChallenge = $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(['click_count' => 2]),
        )->assertStatus(428);
        $expired = TalosBrowserHmiApproval::query()->findOrFail($freshChallenge->json('details.approval_id'));
        $expired->forceFill(['expires_at' => now()->subSecond()])->save();
        $this->postJson("/api/talos/browser/interactions/{$expired->id}/confirm", [
            'decision' => 'approve',
            'request_hash' => $expired->request_hash,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_HMI_APPROVAL_EXPIRED');
        $this->assertSame('expired', $expired->fresh()->status);
    }

    public function test_malformed_preflight_is_treated_as_stale_and_does_not_reach_execution(): void
    {
        $this->client->preflightPointerResponse = [
            ...$this->preflight(),
            'session_id' => 'wrong-worker-session',
        ];

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TARGET_STALE');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 0);
    }

    public function test_internally_inconsistent_preflight_attestation_is_rejected_before_execution(): void
    {
        $this->client->preflightPointerResponse = $this->preflight('Close', [
            'effect_attestation' => 'unattestable',
            'required_effect_classification' => 'ordinary',
        ]);

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TARGET_STALE');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 0);
    }

    public function test_preflight_bound_to_a_different_frame_is_rejected_without_execution(): void
    {
        $this->client->preflightPointerResponse = [
            ...$this->preflight(),
            'frame_sha256' => 'sha256:'.str_repeat('f', 64),
        ];

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_FRAME_STALE');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
        $this->assertSame('active', $this->browser->fresh()->status);
    }

    public function test_preflight_failures_preserve_worker_semantics_without_entering_recovery(): void
    {
        foreach ([
            ['TALOS_BROWSER_FRAME_STALE', 409],
            ['TALOS_BROWSER_HMI_TARGET_MISSING', 403],
            ['TALOS_BROWSER_HMI_TARGET_BOUNDS', 413],
        ] as [$code, $status]) {
            $this->client->failure = new BrowserWorkerException($code, 'Preflight rejected.');
            $this->postJson(
                "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
                $this->pointerPayload(),
            )
                ->assertStatus($status)
                ->assertJsonPath('code', $code);
            $this->client->failure = null;
        }

        $this->assertSame('active', $this->browser->fresh()->status);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'hmi.recovery_required',
        ]);
    }

    public function test_execute_failures_preserve_worker_status_semantics_without_entering_recovery(): void
    {
        foreach ([
            ['TALOS_BROWSER_HMI_TARGET_BOUNDS', 413],
            ['TALOS_BROWSER_HMI_CONTEXT_INVALID', 409],
        ] as [$code, $status]) {
            $this->client->afterRequest = function (string $method) use ($code): void {
                if ($method === 'preflightPointer') {
                    $this->client->failure = new BrowserWorkerException($code, 'Execution rejected before dispatch.');
                }
            };

            $this->postJson(
                "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
                $this->pointerPayload(),
            )
                ->assertStatus($status)
                ->assertJsonPath('code', $code);

            $this->client->failure = null;
            $this->client->afterRequest = null;
        }

        $this->assertSame('active', $this->browser->fresh()->status);
        $this->assertDatabaseMissing('talos_browser_events', [
            'browser_session_id' => $this->browser->id,
            'type' => 'hmi.recovery_required',
        ]);
    }

    public function test_incomplete_target_descriptor_is_rejected_before_execution(): void
    {
        $preflight = $this->preflight();
        unset($preflight['target']['role']);
        $this->client->preflightPointerResponse = $preflight;

        $this->postJson(
            "/api/talos/browser/sessions/{$this->browser->id}/interactions/pointer",
            $this->pointerPayload(),
        )
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TARGET_STALE');

        $this->assertSame(['preflightPointer'], array_column($this->client->requests, 'method'));
    }

    public function test_direct_screenshot_becomes_a_hash_verified_versioned_hmi_frame(): void
    {
        $bytes = 'fresh direct screenshot';
        $this->client->screenshotResponse = [
            'sessionId' => $this->browser->worker_session_id,
            'stateVersion' => 7,
            'mime' => 'image/png',
            'width' => 800,
            'height' => 600,
            'sha256' => hash('sha256', $bytes),
            'base64' => base64_encode($bytes),
            'capturedAt' => now()->toJSON(),
        ];

        $response = $this->postJson("/api/talos/browser/sessions/{$this->browser->id}/screenshot")
            ->assertCreated()
            ->assertJsonPath('data.state_version', 7)
            ->assertJsonPath('data.trust_boundary', 'untrusted_browser_content');

        $artifact = TalosBrowserArtifact::query()->findOrFail($response->json('data.id'));
        $this->assertSame(7, $artifact->state_version);
        $this->assertSame(7, $artifact->source_state_version);
        $this->assertSame(hash('sha256', $bytes), $artifact->sha256);
        $this->assertSame($artifact->id, $this->browser->fresh()->last_screenshot_artifact_id);
    }

    /** @param array<string, mixed> $overrides */
    private function pointerPayload(array $overrides = []): array
    {
        return array_replace([
            'schema_version' => 'talos_browser_hmi_pointer_v1',
            'artifact_id' => $this->frame->id,
            'artifact_sha256' => 'sha256:'.$this->frame->sha256,
            'state_version' => 7,
            'normalized_x' => 0.25,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ], $overrides);
    }

    /** @param array<string, mixed> $targetOverrides @return array<string, mixed> */
    private function preflight(string $name = 'Reject optional cookies', array $targetOverrides = []): array
    {
        return [
            'schema_version' => 'talos_browser_hmi_preflight_v2',
            'session_id' => 'worker-hmi-api',
            'state_version' => 7,
            'frame_sha256' => 'sha256:'.$this->frame->sha256,
            'origin' => 'https://example.com',
            'point' => [
                'normalized_x' => 0.25,
                'normalized_y' => 0.5,
                'x' => 200,
                'y' => 300,
            ],
            'target' => array_replace([
                'tag' => 'button',
                'role' => 'button',
                'name' => $name,
                'input_type' => null,
                'href' => null,
                'form_method' => null,
                'is_editable' => false,
                'is_submit' => false,
                'is_download' => false,
                'opens_new_context' => false,
                'effect_attestation' => 'browser_default',
                'required_effect_classification' => 'ordinary',
                'visible' => true,
                'disabled' => false,
                'fingerprint' => 'sha256:'.str_repeat('a', 64),
            ], $targetOverrides),
        ];
    }

    /** @return array<string, mixed> */
    private function workerResult(): array
    {
        $screenshotBytes = 'hmi api result png';
        $snapshot = [
            'snapshot_id' => 'snap_123e4567-e89b-12d3-a456-426614174000',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Page after the browser interaction',
            'nodes' => [[
                'ref' => 'r1',
                'role' => 'heading',
                'name' => 'Page after click',
                'visible' => true,
            ]],
        ];

        return [
            'schema_version' => 'talos_browser_hmi_result_v2',
            'capture_id' => 'cap_123e4567-e89b-12d3-a456-426614174000',
            'command_id' => null,
            'session_id' => 'worker-hmi-api',
            'source_state_version' => 7,
            'state_version' => 8,
            'frame_sha256' => 'sha256:'.$this->frame->sha256,
            'url' => 'https://example.com/after',
            'title' => 'After click',
            'effect_classification' => null,
            'sensitive_effect_authorized' => null,
            'target' => $this->preflight()['target'],
            'screenshot' => [
                'mime_type' => 'image/png',
                'width' => 800,
                'height' => 600,
                'sha256' => 'sha256:'.hash('sha256', $screenshotBytes),
                'base64' => base64_encode($screenshotBytes),
            ],
            'snapshot' => [
                ...$snapshot,
                'sha256' => 'sha256:'.hash('sha256', $this->canonicalJson($snapshot)),
            ],
            'captured_at' => now()->toJSON(),
        ];
    }

    private function storeCurrentFrame(TalosBrowserSession $session, int $stateVersion): TalosBrowserArtifact
    {
        $contents = 'initial hmi frame';
        $id = (string) str()->uuid();
        $path = TalosBrowserArtifactStore::artifactPath((int) $session->user_id, (string) $session->id, $id);
        Storage::disk('local')->put($path, $contents);
        $artifact = TalosBrowserArtifact::query()->create([
            'id' => $id,
            'browser_session_id' => $session->id,
            'user_id' => $session->user_id,
            'source_state_version' => $stateVersion,
            'state_version' => $stateVersion,
            'trust_boundary' => 'untrusted_browser_content',
            'type' => 'screenshot',
            'mime' => 'image/png',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'sha256' => hash('sha256', $contents),
            'metadata' => ['width' => 800, 'height' => 600, 'state_version' => $stateVersion],
        ]);
        $session->update(['last_screenshot_artifact_id' => $artifact->id]);

        return $artifact;
    }

    private function canonicalJson(mixed $value): string
    {
        if (! is_array($value)) {
            return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        if (array_is_list($value)) {
            $normalized = array_map(fn (mixed $item): mixed => json_decode($this->canonicalJson($item), true), $value);
        } else {
            ksort($value);
            $normalized = [];
            foreach ($value as $key => $item) {
                $normalized[$key] = json_decode($this->canonicalJson($item), true);
            }
        }

        return json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
