<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosFile;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Agent\TalosProviderOutcomeCodec;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\FileAuthority\TalosFileAuthorityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;

final class TalosChatProceduralBrowserTest extends TestCase
{
    use RefreshDatabase;

    private string $storageRoot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->storageRoot = storage_path('framework/testing/disks/b7-chat-upload-'.Str::uuid());
        config(['filesystems.disks.local' => [
            'driver' => 'local',
            'root' => $this->storageRoot,
            'throw' => true,
        ]]);
        Storage::forgetDisk('local');
    }

    protected function tearDown(): void
    {
        Storage::forgetDisk('local');
        if (isset($this->storageRoot)) {
            File::deleteDirectory($this->storageRoot);
        }
        parent::tearDown();
    }

    public function test_browser_mode_uses_native_procedural_tool_calls_instead_of_legacy_jmp_plans(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural browser',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Procedural browser test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-browser',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'hmiActions' => true,
            ],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Come posso nascondere il cookie modal nello screenshot?',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $competingArtifactId = null;
        $adapter = new ProceduralBrowserRouteAdapter(function () use ($browser, &$competingArtifactId): void {
            $current = $browser->fresh();
            $this->assertInstanceOf(TalosBrowserSession::class, $current);
            $snapshot = [
                'format' => 'accessibility_refs_v1',
                'snapshotId' => 'snap_competing-run',
                'url' => 'https://competing.example.test',
                'title' => 'Competing run',
                'textDigest' => 'Evidence from a different concurrent run.',
                'nodes' => [],
            ];
            $artifact = app(TalosBrowserArtifactStore::class)->store(
                $current,
                'snapshot',
                'application/json',
                json_encode($snapshot, JSON_THROW_ON_ERROR),
                [
                    'snapshot_id' => $snapshot['snapshotId'],
                    'url' => $snapshot['url'],
                    'title' => $snapshot['title'],
                    'text_digest' => $snapshot['textDigest'],
                ],
            );
            $current->update([
                'last_snapshot_artifact_id' => $artifact->id,
                'current_url' => $snapshot['url'],
                'current_title' => $snapshot['title'],
            ]);
            $competingArtifactId = (string) $artifact->id;
        });
        $this->app->instance(TalosProviderAdapterResolver::class, new ProceduralBrowserRouteResolver($adapter));
        Http::fake(['*' => Http::response([
            'mutations' => [],
            'errors' => ['legacy planner cannot parse the native tool call'],
            'text' => '',
        ])]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
        ])->assertOk()
            ->assertJsonPath('text', 'The current page was inspected through verified browser evidence.')
            ->assertJsonPath('agent_turn.status', 'completed');

        Http::assertNothingSent();
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(1, $adapter->continueCalls);
        $this->assertContains('browser_snapshot', $adapter->advertisedBrowserTools);
        $this->assertNotContains('BROWSER_COMMAND', $adapter->advertisedBrowserTools);
        foreach ($client->requests as $workerRequest) {
            $this->assertSame(
                'talos-user:'.$user->id,
                $workerRequest['ownerRef'] ?? null,
                'Every request in one procedural Browser turn must retain the worker session owner identity.',
            );
        }
        $this->assertSame('completed', TalosToolTurn::query()->where('run_id', $response->json('run.id'))->value('status'));
        $runSnapshotId = $response->json('browser_activities.0.artifact_ids.0');
        $this->assertIsString($runSnapshotId);
        $this->assertIsString($competingArtifactId);
        $this->assertNotSame($competingArtifactId, $runSnapshotId);
        $this->assertSame($runSnapshotId, $response->json('used_browser_context.snapshot_artifact_id'));
        $this->assertSame($runSnapshotId, $response->json('assistant_message.metadata.used_browser_context.snapshot_artifact_id'));
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'browser_session_id' => $browser->id,
            'type' => 'snapshot',
        ]);
        $this->assertDatabaseHas('talos_messages', [
            'session_id' => $session->id,
            'run_id' => $response->json('run.id'),
            'role' => 'assistant',
            'content' => 'The current page was inspected through verified browser evidence.',
        ]);
    }

    public function test_procedural_browser_runtime_failure_is_typed_and_never_reported_as_validator_rejection(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural browser runtime failure',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Procedural browser runtime failure test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-runtime-failure',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
            ],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'naaviga su https://caradero-web.vercel.app/vehicles e dimmi cosa vedi',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        $client = new FakeBrowserSessionClient;
        $inspectionCount = 0;
        $client->afterRequest = static function (string $method) use (&$inspectionCount): void {
            if ($method !== 'inspect') {
                return;
            }
            $inspectionCount++;
            if ($inspectionCount === 2) {
                throw new BrowserWorkerException(
                    'TALOS_BROWSER_SESSION_NOT_FOUND',
                    'The worker session disappeared before budget verification.',
                );
            }
        };
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new ProceduralBrowserRouteResolver(new ProceduralBrowserRouteAdapter),
        );

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_BUDGET_STATE_UNAVAILABLE')
            ->assertJsonPath('chat_error.layer', 'browser_runtime')
            ->assertJsonPath('chat_error.code', 'TALOS_BROWSER_BUDGET_STATE_UNAVAILABLE')
            ->assertJsonPath('chat_error.retryable', true);
        $this->assertStringNotContainsString('validator rejected', strtolower((string) $response->json('message')));
        $this->assertSame('failed', $response->json('run.status'));
    }

    public function test_breg_006_browser_click_is_presented_for_exact_approval_and_resumes_the_same_turn_with_evidence(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural browser click',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Procedural browser click test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-click',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'hmiActions' => true,
            ],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Accetta il banner cookie.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_cookie-approval',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Cookie preferences Accept all',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->app->instance(BrowserSessionClient::class, $client);
        $adapter = new ProceduralBrowserClickRouteAdapter;
        $this->app->instance(TalosProviderAdapterResolver::class, new ProceduralBrowserRouteResolver($adapter));

        $pending = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
        ])->assertStatus(202)
            ->assertJsonPath('agent_turn.status', 'awaiting_approval')
            ->assertJsonPath('pending_approvals.0.tool_name', 'browser_click')
            ->assertJsonPath('pending_approvals.0.risk', 'high')
            ->assertJsonPath('pending_approvals.0.capability', 'browser.write')
            ->assertJsonPath('pending_approvals.0.target.ref', 'r1')
            ->assertJsonPath('pending_approvals.0.target.name', 'Accept all');
        $this->assertArrayNotHasKey('error', $pending->json());
        $turnId = $pending->json('agent_turn.id');
        $approvalId = $pending->json('pending_approvals.0.id');
        $planHash = $pending->json('pending_approvals.0.plan_hash');
        $this->assertIsString($turnId);
        $this->assertIsString($approvalId);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', (string) $planHash);
        $pausedTurn = TalosToolTurn::query()->findOrFail($turnId);
        $this->assertNull($pausedTurn->execution_lease_token, 'A turn exposed for HMI approval must not retain its worker lease.');
        $this->assertNull($pausedTurn->execution_lease_expires_at, 'A turn exposed for HMI approval must not retain a lease expiry.');
        $pausedCall = $pausedTurn->calls()->findOrFail($approvalId);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', (string) $pausedCall->evidence_hash);
        $this->assertSame($pausedCall->evidence_hash, $pending->json('pending_approvals.0.evidence_hash'));
        $this->assertSame($browser->refresh()->last_snapshot_artifact_id, $pausedCall->evidence_snapshot_artifact_id);
        $this->assertSame($pausedCall->evidence_snapshot_artifact_id, $pending->json('pending_approvals.0.snapshot_artifact_id'));
        $this->assertSame('snap_cookie-approval', $pausedCall->evidence_snapshot_id);
        $this->assertSame($pausedCall->evidence_snapshot_id, $pending->json('pending_approvals.0.snapshot_id'));
        $eventCountBeforeHydration = TalosRunEvent::query()->count();
        $callCountBeforeHydration = $pausedTurn->calls()->count();
        $this->getJson("/api/talos/sessions/{$session->id}/pending-tool-approvals")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $approvalId)
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.actionable', true)
            ->assertJsonPath('data.0.snapshot_artifact_id', $pausedCall->evidence_snapshot_artifact_id)
            ->assertJsonPath('data.0.snapshot_id', $pausedCall->evidence_snapshot_id);
        $this->assertSame($eventCountBeforeHydration, TalosRunEvent::query()->count(), 'Approval hydration must not append run events.');
        $this->assertSame($callCountBeforeHydration, $pausedTurn->calls()->count(), 'Approval hydration must not mutate tool calls.');
        $pausedCheckpoint = app(TalosProceduralGuardCheckpointStore::class)->load($pausedTurn);
        $storedCall = ToolCall::fromJson((string) $pausedCall->canonical_call);
        $this->assertTrue($pausedCheckpoint->containsCompiledCall(
            $storedCall,
            (string) $pausedCall->fingerprint,
        ));
        $storedOutcome = TalosProviderOutcomeCodec::decode((string) $pausedTurn->provider_outcome);
        $outcomeCall = ToolCall::fromJson(json_encode($storedOutcome['tool_calls'][0], JSON_THROW_ON_ERROR));
        $this->assertSame(
            ProceduralLoopGuard::canonicalJson($storedCall->toWireArray()),
            ProceduralLoopGuard::canonicalJson($outcomeCall->toWireArray()),
        );
        $this->assertTrue($pausedCheckpoint->containsCompiledCall($outcomeCall, (string) $pausedCall->fingerprint));

        $browser->refresh();
        $boundSnapshotArtifactId = (string) $browser->last_snapshot_artifact_id;
        $boundSnapshot = TalosBrowserArtifact::query()->findOrFail($boundSnapshotArtifactId);
        $sameStateReplacement = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $user->id,
            'worker_capture_id' => 'capture-same-state-replacement',
            'source_command_id' => 'same-state-replacement',
            'source_state_version' => $boundSnapshot->source_state_version,
            'state_version' => $boundSnapshot->state_version,
            'trust_boundary' => $boundSnapshot->trust_boundary,
            'type' => 'snapshot',
            'mime' => $boundSnapshot->mime,
            'storage_disk' => $boundSnapshot->storage_disk,
            'storage_path' => $boundSnapshot->storage_path,
            'sha256' => $boundSnapshot->sha256,
            'metadata' => $boundSnapshot->metadata,
        ]);
        $browser->forceFill(['last_snapshot_artifact_id' => $sameStateReplacement->id])->save();
        $requestsBeforeStaleApproval = count($client->requests);

        $this->getJson("/api/talos/sessions/{$session->id}/pending-tool-approvals")
            ->assertOk()
            ->assertJsonPath('data.0.id', $approvalId)
            ->assertJsonPath('data.0.status', 'stale')
            ->assertJsonPath('data.0.actionable', false)
            ->assertJsonPath('data.0.stale_reason', 'TALOS_BROWSER_STALE_EVIDENCE');

        $this->postJson("/api/talos/agent-turns/{$turnId}/approvals/{$approvalId}", [
            'decision' => 'approve',
            'plan_hash' => $planHash,
        ])->assertConflict()
            ->assertJsonPath('code', 'TALOS_TOOL_APPROVAL_CONFLICT');

        $this->assertSame('awaiting_approval', $pausedCall->refresh()->approval_state);
        $this->assertCount($requestsBeforeStaleApproval, $client->requests, 'A same-state snapshot replacement must be rejected before worker dispatch.');
        $browser->forceFill(['last_snapshot_artifact_id' => $boundSnapshotArtifactId])->save();

        $approved = $this->postJson("/api/talos/agent-turns/{$turnId}/approvals/{$approvalId}", [
            'decision' => 'approve',
            'plan_hash' => $planHash,
        ])->assertOk()
            ->assertJsonPath('agent_turn.status', 'completed')
            ->assertJsonPath('text', 'The cookie banner was dismissed through verified browser evidence.')
            ->assertJsonPath('pending_approvals', []);

        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(2, $adapter->continueCalls);
        $this->assertSame('browser_click', collect($client->requests)->last()['name']);
        $this->assertSame('Accept all', collect($client->requests)->last()['arguments']['element']);
        $this->assertCount(2, $adapter->clickEvidence);
        $this->assertSame(['screenshot', 'snapshot'], array_column($adapter->clickEvidence, 'kind'));
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
            'source_command_id' => 'provider-browser-click',
        ]);
        $this->assertDatabaseHas('talos_messages', [
            'session_id' => $session->id,
            'run_id' => $approved->json('run.id'),
            'role' => 'assistant',
            'content' => 'The cookie banner was dismissed through verified browser evidence.',
        ]);
    }

    public function test_browser_file_upload_provider_receives_authorized_file_manifest_then_requires_exact_approval_and_reconciled_evidence(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural browser upload',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Procedural browser upload test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-upload',
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.com/upload',
            'current_title' => 'Upload form',
            'viewport_width' => 1,
            'viewport_height' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'hmiActions' => true,
                'uploads' => true,
            ],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Carica proof.txt nel selettore corrente.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);
        Storage::disk('local')->put('vault/private/proof.txt', 'proof');
        $file = TalosFile::query()->create([
            'user_id' => $user->id,
            'original_name' => 'proof.txt',
            'mime_type' => 'text/plain',
            'size_bytes' => 5,
            'checksum' => hash('sha256', 'proof'),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => 'vault/private/proof.txt',
            'parser' => 'text',
        ]);
        $grant = $this->app->make(TalosFileAuthorityService::class)->create((int) $user->id, [
            'scope' => 'file',
            'permissions' => ['model.read', 'browser.upload'],
            'file_ids' => [(string) $file->id],
        ]);
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_upload-approval',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Choose file',
            'nodes' => [['ref' => 'r4', 'role' => 'button', 'name' => 'Choose file', 'visible' => true]],
            'url' => 'https://example.com/upload',
            'title' => 'Upload form',
        ];
        $client->inspectResponse = [
            'sessionId' => $browser->worker_session_id,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1, 'height' => 1],
            'capabilities' => $browser->capabilities,
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $this->app->instance(BrowserSessionClient::class, $client);
        $adapter = new ProceduralBrowserUploadRouteAdapter((string) $file->id);
        $this->app->instance(TalosProviderAdapterResolver::class, new ProceduralBrowserRouteResolver($adapter));

        $pending = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
            'attachment_file_ids' => [(string) $file->id],
            'attachment_grant_ids' => [(string) $grant->id],
        ])->assertStatus(202)
            ->assertJsonPath('agent_turn.status', 'awaiting_approval')
            ->assertJsonPath('pending_approvals.0.tool_name', 'browser_file_upload')
            ->assertJsonPath('pending_approvals.0.capability', 'browser.upload')
            ->assertJsonPath('pending_approvals.0.risk', 'critical');
        $this->assertSame('pending', $pending->json('pending_approvals.0.status'), json_encode($pending->json(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $this->assertTrue($pending->json('pending_approvals.0.actionable'), json_encode($pending->json(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $this->assertSame((string) $file->id, $pending->json('pending_approvals.0.files.0.file_id'), json_encode($pending->json(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $this->assertSame('proof.txt', $pending->json('pending_approvals.0.files.0.name'));
        $this->assertSame((string) $file->id, $pending->json('used_attachments.0.file_id'));
        $this->assertSame('proof.txt', $pending->json('used_attachments.0.file_name'));
        $this->assertSame((string) $file->checksum, $pending->json('used_attachments.0.sha256'));
        $providerPrompt = (string) ($adapter->receivedMessages[array_key_last($adapter->receivedMessages)]['content'] ?? '');
        $this->assertStringContainsString('TALOS_FILE_RESOURCE_MANIFEST_V1', $providerPrompt);
        $this->assertStringContainsString((string) $file->id, $providerPrompt);
        $this->assertStringContainsString('proof.txt', $providerPrompt);
        $this->assertStringNotContainsString('vault/private/proof.txt', $providerPrompt);
        $this->assertStringNotContainsString((string) $grant->id, $providerPrompt);
        $this->assertStringNotContainsString(base64_encode('proof'), $providerPrompt);
        $this->assertSame('Carica proof.txt nel selettore corrente.', $userMessage->refresh()->content);
        $turnId = $pending->json('agent_turn.id');
        $approvalId = $pending->json('pending_approvals.0.id');
        $planHash = $pending->json('pending_approvals.0.plan_hash');
        $this->assertIsString($turnId);
        $this->assertIsString($approvalId);
        $this->assertIsString($planHash);
        $client->callToolResponse = $this->uploadWorkerResult((string) $file->id, (string) $file->checksum);

        $approved = $this->postJson("/api/talos/agent-turns/{$turnId}/approvals/{$approvalId}", [
            'decision' => 'approve',
            'plan_hash' => $planHash,
        ])->assertOk()
            ->assertJsonPath('agent_turn.status', 'completed')
            ->assertJsonPath('text', 'The approved Vault file was uploaded through verified browser evidence.')
            ->assertJsonPath('used_attachments.0.file_id', (string) $file->id)
            ->assertJsonPath('assistant_message.metadata.used_attachments.0.file_id', (string) $file->id)
            ->assertJsonPath('pending_approvals', []);

        $uploadRequest = collect($client->requests)->firstWhere('method', 'upload');
        $stageRequest = collect($client->requests)->firstWhere('method', 'stageFile');
        $this->assertIsArray($uploadRequest);
        $this->assertIsArray($stageRequest);
        $this->assertSame('user_approval', $uploadRequest['authorization']->toCapabilityAttestation()['kind']);
        $this->assertArrayNotHasKey('file_ids', $uploadRequest['arguments']);
        $this->assertSame(base64_encode('proof'), $stageRequest['file']['base64']);
        $this->assertSame(['screenshot', 'snapshot'], array_column($adapter->uploadEvidence, 'kind'));
        $uploadBundle = TalosBrowserEvidenceBundle::query()
            ->where('worker_state_version', 1)
            ->whereNotNull('reconciled_at')
            ->firstOrFail();
        $this->assertSame('upload', $uploadBundle->action()->value('kind'));
        $this->assertDatabaseHas('talos_messages', [
            'session_id' => $session->id,
            'run_id' => $approved->json('run.id'),
            'role' => 'assistant',
            'content' => 'The approved Vault file was uploaded through verified browser evidence.',
        ]);
        $wire = json_encode($approved->json(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('vault/private/proof.txt', $wire);
        $this->assertStringNotContainsString(base64_encode('proof'), $wire);
    }

    private function uploadWorkerResult(string $fileId, string $checksum): BrowserToolResult
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
        $this->assertIsString($png);
        $snapshot = [
            'snapshot_id' => 'snap_upload-completed',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Selected proof.txt',
            'nodes' => [['ref' => 'r4', 'role' => 'button', 'name' => 'proof.txt', 'visible' => true]],
        ];
        $snapshotBytes = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $screenshotHash = 'sha256:'.hash('sha256', $png);
        $snapshotHash = 'sha256:'.hash('sha256', $snapshotBytes);
        $evidence = [
            ['artifact_id' => 'shot-upload-route', 'kind' => 'screenshot', 'sha256' => $screenshotHash, 'trusted_boundary' => 'untrusted_browser_content'],
            ['artifact_id' => 'snap-upload-route', 'kind' => 'snapshot', 'sha256' => $snapshotHash, 'trusted_boundary' => 'untrusted_browser_content'],
        ];

        return BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => 'provider-browser-upload',
            'isError' => false,
            'content' => [
                ['type' => 'text', 'text' => 'Uploaded proof.txt'],
                ['type' => 'image', 'data' => base64_encode($png), 'mimeType' => 'image/png'],
            ],
            'structuredContent' => [
                'url' => 'https://example.com/upload',
                'title' => 'Upload form',
                'state_version' => 1,
                'evidence_ids' => array_column($evidence, 'artifact_id'),
                'target' => ['ref' => 'r4', 'role' => 'button', 'name' => 'Choose file'],
                'files' => [[
                    'file_id' => $fileId,
                    'name' => 'proof.txt',
                    'mime_type' => 'text/plain',
                    'size_bytes' => 5,
                    'sha256' => 'sha256:'.$checksum,
                ]],
                'screenshot' => ['mime_type' => 'image/png', 'width' => 1, 'height' => 1, 'sha256' => $screenshotHash],
                'snapshot' => [...$snapshot, 'sha256' => $snapshotHash],
            ],
            'evidence' => $evidence,
        ], 'provider-browser-upload');
    }

    public function test_breg_007_screenshot_evidence_is_attached_to_the_assistant_message_immediately_and_after_reload(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural screenshot',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Procedural screenshot test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-screenshot',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
            ],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Cattura screenshot.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        $client = new FakeBrowserSessionClient;
        $client->screenshotResponse = ['url' => 'about:blank', 'title' => ''];
        $this->app->instance(BrowserSessionClient::class, $client);
        $adapter = new ProceduralBrowserHallucinatedScreenshotAdapter;
        $this->app->instance(TalosProviderAdapterResolver::class, new ProceduralBrowserRouteResolver($adapter));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as verified TALOS evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded')
            ->assertJsonPath('browser_activities.0.browser_session_id', $browser->id)
            ->assertJsonPath('assistant_message.session_id', $session->id)
            ->assertJsonPath('assistant_message.content', 'Screenshot captured and attached as verified TALOS evidence.')
            ->assertJsonPath('assistant_message.metadata.browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('assistant_message.metadata.browser_activities.0.status', 'succeeded')
            ->assertJsonPath('assistant_message.metadata.browser_activities.0.browser_session_id', $browser->id)
            ->assertJsonStructure(['assistant_message' => ['id', 'created_at']]);

        $this->assertSame(0, $adapter->startCalls, 'An unambiguous screenshot command must not be delegated to the model.');
        $this->assertStringNotContainsString('talo.sh', (string) $response->json('assistant_message.content'));

        $artifactId = $response->json('assistant_message.metadata.browser_activities.0.artifact_ids.0');
        $this->assertIsString($artifactId);
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $artifactId,
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
        ]);
        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $this->assertSame('about:blank', $artifact->metadata['url'] ?? null);
        $this->assertSame(
            'about:blank',
            TalosBrowserEvidenceBundle::query()->where('screenshot_artifact_id', $artifactId)->firstOrFail()->url,
        );
        $succeededEvent = TalosRunEvent::query()
            ->where('run_id', $response->json('run.id'))
            ->where('event_type', 'browser.command.succeeded')
            ->firstOrFail();
        $this->assertSame('screenshot', $succeededEvent->payload['operation'] ?? null);
        $this->assertContains($artifactId, $succeededEvent->payload['artifact_ids'] ?? []);
        $preview = $this->get("/api/talos/browser/artifacts/{$artifactId}/preview?talos_session_id={$session->id}")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
        $this->assertNotSame('', $preview->getContent());

        $messages = $this->getJson("/api/talos/sessions/{$session->id}/messages")
            ->assertOk()
            ->json('data');
        $assistant = collect($messages)->firstWhere('role', 'assistant');
        $this->assertIsArray($assistant);
        $this->assertSame($artifactId, data_get($assistant, 'metadata.browser_activities.0.artifact_ids.0'));
        $this->assertSame('Screenshot captured and attached as verified TALOS evidence.', $assistant['content']);
        $this->assertStringNotContainsString('https://talo.sh/artifact/', (string) data_get($assistant, 'metadata.browser_activities.0.artifact_ids.0'));

        $persistedAssistant = TalosMessage::query()->findOrFail($assistant['id']);
        $spoofedArtifactId = (string) Str::uuid();
        $persistedAssistant->forceFill(['metadata' => [
            'source' => 'talos_agent_turn',
            'grounded' => true,
            'browser_activities' => [[
                'id' => (string) Str::uuid(),
                'operation' => 'screenshot',
                'status' => 'succeeded',
                'label' => 'Forged screenshot',
                'run_id' => (string) $persistedAssistant->run_id,
                'browser_session_id' => (string) $browser->id,
                'artifact_ids' => [$spoofedArtifactId],
                'occurred_at' => now()->toJSON(),
                'error_code' => null,
            ]],
            'used_browser_context' => [
                'browser_session_id' => (string) $browser->id,
                'screenshot_artifact_id' => $spoofedArtifactId,
                'evidence_hash' => 'sha256:'.str_repeat('0', 64),
                'untrusted' => true,
            ],
        ]])->save();
        $recovered = $this->getJson("/api/talos/sessions/{$session->id}/messages")
            ->assertOk()
            ->json('data');
        $recoveredAssistant = collect($recovered)->firstWhere('id', $assistant['id']);
        $this->assertSame($artifactId, data_get($recoveredAssistant, 'metadata.browser_activities.0.artifact_ids.0'));
        $this->assertNotSame($spoofedArtifactId, data_get($recoveredAssistant, 'metadata.browser_activities.0.artifact_ids.0'));
        $this->assertSame($spoofedArtifactId, data_get($persistedAssistant->refresh()->metadata, 'browser_activities.0.artifact_ids.0'));
    }

    public function test_breg_008_provider_screenshot_claim_without_committed_artifact_is_not_promoted(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Unsupported screenshot claim',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Unsupported screenshot claim test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-unsupported-screenshot-claim',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
            ],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Descrivi lo screenshot che hai catturato.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);

        $this->app->instance(BrowserSessionClient::class, new FakeBrowserSessionClient);
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new ProceduralBrowserRouteResolver(new ProceduralBrowserHallucinatedScreenshotAdapter),
        );

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'browser_mode' => [
                'enabled' => true,
                'browser_session_id' => $browser->id,
            ],
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_GROUNDING_EVIDENCE_REQUIRED')
            ->assertJsonPath('chat_error.layer', 'agent_evidence')
            ->assertJsonPath('chat_error.code', 'TALOS_GROUNDING_EVIDENCE_REQUIRED');
        $this->assertDatabaseMissing('talos_messages', [
            'session_id' => $session->id,
            'role' => 'assistant',
            'content' => "Ecco l'ultimo screenshot della pagina:\n\n![Screenshot ManagerCar](https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a)",
        ]);
    }
}

final class ProceduralBrowserRouteResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}

final class ProceduralBrowserRouteAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    /** @var list<string> */
    public array $advertisedBrowserTools = [];

    public function __construct(private readonly ?\Closure $beforeFinal = null) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'procedural_browser_route_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        $this->advertisedBrowserTools = array_values(array_filter(
            array_map(static fn ($tool): string => $tool->name, $request->tools),
            static fn (string $name): bool => str_starts_with($name, 'browser_'),
        ));
        $call = new ToolCall('provider-browser-snapshot', 'browser_snapshot', [], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState(
                'openai',
                'procedural_browser_route_v1',
                'response-browser-tools',
                'test_state',
                ['round' => 1],
                ['provider-browser-snapshot'],
            ),
            'response-browser-tools',
            'tool_calls',
            new TokenUsage(10, 4, 14),
        );
    }

    /** @param list<ToolResult> $toolResults */
    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult || $result->isError || $result->toolUseId !== 'provider-browser-snapshot') {
            throw new \RuntimeException('The procedural browser result was not correlated.');
        }
        ($this->beforeFinal) && ($this->beforeFinal)();

        return ProviderTurnResponse::final(
            'The current page was inspected through verified browser evidence.',
            'response-browser-final',
            'stop',
            new TokenUsage(12, 8, 20),
        );
    }
}

final class ProceduralBrowserClickRouteAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    /** @var list<array<string, mixed>> */
    public array $clickEvidence = [];

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'procedural_browser_click_route_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return ProviderTurnResponse::toolCalls(
            null,
            [new ToolCall('provider-browser-snapshot', 'browser_snapshot', [], null, [])],
            new ProviderTurnState(
                'openai',
                'procedural_browser_click_route_v1',
                'response-browser-snapshot',
                'snapshot_state',
                ['round' => 1],
                ['provider-browser-snapshot'],
            ),
            'response-browser-snapshot',
            'tool_calls',
            new TokenUsage(10, 4, 14),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult || $result->isError) {
            throw new \RuntimeException('The procedural browser result was not correlated.');
        }

        if ($result->toolUseId === 'provider-browser-snapshot') {
            return ProviderTurnResponse::toolCalls(
                null,
                [new ToolCall('provider-browser-click', 'browser_click', [
                    'target' => 'r1',
                    'element' => 'Model-authored text must not control the target name.',
                ], null, [])],
                new ProviderTurnState(
                    'openai',
                    'procedural_browser_click_route_v1',
                    'response-browser-click',
                    'click_state',
                    ['round' => 2],
                    ['provider-browser-click'],
                ),
                'response-browser-click',
                'tool_calls',
                new TokenUsage(12, 6, 18),
            );
        }

        if ($result->toolUseId !== 'provider-browser-click') {
            throw new \RuntimeException('The procedural click result was not correlated.');
        }
        $this->clickEvidence = $result->evidence;

        return ProviderTurnResponse::final(
            'The cookie banner was dismissed through verified browser evidence.',
            'response-browser-click-final',
            'stop',
            new TokenUsage(14, 8, 22),
        );
    }
}

final class ProceduralBrowserUploadRouteAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    /** @var list<array<string, mixed>> */
    public array $uploadEvidence = [];

    /** @var list<array{role: string, content: string}> */
    public array $receivedMessages = [];

    public function __construct(private readonly string $fileId) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'procedural_browser_upload_route_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        $this->receivedMessages = $request->messages;

        return ProviderTurnResponse::toolCalls(
            null,
            [new ToolCall('provider-browser-snapshot', 'browser_snapshot', [], null, [])],
            new ProviderTurnState(
                'openai',
                'procedural_browser_upload_route_v1',
                'response-browser-upload-snapshot',
                'upload_snapshot_state',
                ['round' => 1],
                ['provider-browser-snapshot'],
            ),
            'response-browser-upload-snapshot',
            'tool_calls',
            new TokenUsage(10, 4, 14),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult || $result->isError) {
            throw new \RuntimeException('The procedural browser upload result was not correlated.');
        }

        if ($result->toolUseId === 'provider-browser-snapshot') {
            return ProviderTurnResponse::toolCalls(
                null,
                [new ToolCall('provider-browser-upload', 'browser_file_upload', [
                    'target' => 'r4',
                    'element' => 'Model-authored text must not control the target name.',
                    'file_ids' => [$this->fileId],
                ], null, [])],
                new ProviderTurnState(
                    'openai',
                    'procedural_browser_upload_route_v1',
                    'response-browser-upload',
                    'upload_state',
                    ['round' => 2],
                    ['provider-browser-upload'],
                ),
                'response-browser-upload',
                'tool_calls',
                new TokenUsage(12, 6, 18),
            );
        }

        if ($result->toolUseId !== 'provider-browser-upload') {
            throw new \RuntimeException('The procedural file upload result was not correlated.');
        }
        $this->uploadEvidence = $result->evidence;

        return ProviderTurnResponse::final(
            'The approved Vault file was uploaded through verified browser evidence.',
            'response-browser-upload-final',
            'stop',
            new TokenUsage(14, 8, 22),
        );
    }
}

final class ProceduralBrowserHallucinatedScreenshotAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'procedural_browser_hallucinated_screenshot_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return ProviderTurnResponse::final(
            "Ecco l'ultimo screenshot della pagina:\n\n![Screenshot ManagerCar](https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a)",
            'response-browser-hallucinated-screenshot',
            'stop',
            new TokenUsage(10, 12, 22),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        throw new \RuntimeException('The deterministic screenshot path must not continue a provider turn.');
    }
}
