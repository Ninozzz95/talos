<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosAuditEvent;
use App\Models\TalosFile;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Runs\RunEventNormalizer;
use App\Services\Talos\Agent\TalosLaravelToolExecutionBackend;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserFileUploadService;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use App\Services\Talos\FileAuthority\TalosFileAuthorityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProceduralPlan;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolExecutionContext;
use Tests\TestCase;

final class TalosBrowserFileUploadTest extends TestCase
{
    use RefreshDatabase;

    private FakeBrowserSessionClient $client;

    private string $storageRoot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->storageRoot = storage_path('framework/testing/disks/b7-upload-'.Str::uuid());
        config(['filesystems.disks.local' => [
            'driver' => 'local',
            'root' => $this->storageRoot,
            'throw' => true,
        ]]);
        Storage::forgetDisk('local');
        $this->client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $this->client);
    }

    protected function tearDown(): void
    {
        Storage::forgetDisk('local');
        if (isset($this->storageRoot)) {
            File::deleteDirectory($this->storageRoot);
        }
        parent::tearDown();
    }

    public function test_approved_vault_file_is_staged_uploaded_and_committed_without_path_or_bytes_leakage(): void
    {
        $context = $this->context();
        $this->client->callToolResponse = $this->uploadResult($context);
        $service = $this->app->make(TalosBrowserFileUploadService::class);

        $preview = $service->preview(
            $context['browser'],
            $context['call']->arguments,
            (string) $context['snapshot']->id,
            'sha256:'.(string) $context['snapshot']->sha256,
            'snap_upload-1',
            0,
        );
        self::assertSame(0, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_used')->count());
        $payload = $service->execute(
            $context['browser'],
            $context['run'],
            new RunEventNormalizer,
            $context['call'],
            (string) $context['call']->node_id,
        );

        self::assertSame('r4', $preview['target']['ref']);
        self::assertSame('proof.txt', $preview['files'][0]['name']);
        self::assertArrayNotHasKey('storage_path', $preview['files'][0]);
        self::assertArrayNotHasKey('error', $payload, json_encode([
            'payload' => $payload,
            'requests' => $this->client->requests,
            'browser_events' => $context['browser']->events()->count(),
            'run_events' => $context['run']->events()->count(),
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        self::assertSame('upload', $payload['activity']['operation']);
        self::assertSame($context['file']->id, $payload['observation']['files'][0]['file_id']);
        self::assertCount(2, $payload['activity']['artifact_ids']);

        $stage = collect($this->client->requests)->firstWhere('method', 'stageFile');
        $dispatch = collect($this->client->requests)->firstWhere('method', 'upload');
        self::assertIsArray($stage);
        self::assertSame(base64_encode('proof'), $stage['file']['base64']);
        self::assertSame('proof.txt', $stage['file']['name']);
        self::assertIsArray($dispatch);
        self::assertArrayHasKey('staged_file_ids', $dispatch['arguments']);
        self::assertMatchesRegularExpression('/^stg_[0-9a-f-]{36}$/', $dispatch['arguments']['staged_file_ids'][0]);
        self::assertNotSame((string) $context['file']->id, $dispatch['arguments']['staged_file_ids'][0]);
        self::assertArrayNotHasKey('file_ids', $dispatch['arguments']);
        self::assertSame('user_approval', $dispatch['authorization']->toCapabilityAttestation()['kind']);

        $wire = json_encode([
            'payload' => $payload,
            'run_events' => $context['run']->events()->pluck('payload')->all(),
            'browser_events' => $context['browser']->events()->pluck('payload')->all(),
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString('vault/private/proof.txt', $wire);
        self::assertStringNotContainsString(base64_encode('proof'), $wire);
        self::assertSame(2, TalosBrowserArtifact::query()->where('source_command_id', 'provider-upload-1')->count());
        self::assertSame(1, $context['browser']->refresh()->worker_state_version);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_used')->count());
    }

    public function test_cleanup_failure_is_trace_visible_without_changing_the_primary_upload_result(): void
    {
        $context = $this->context();
        $this->client->callToolResponse = $this->uploadResult($context);
        $this->client->failDiscardStagedFile = true;

        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $context['browser'],
            $context['run'],
            new RunEventNormalizer,
            $context['call'],
            (string) $context['call']->node_id,
        );

        self::assertArrayNotHasKey('error', $payload);
        self::assertSame('succeeded', $payload['activity']['status']);
        $runEvent = $context['run']->events()->where('event_type', 'browser.file_staging.cleanup.failed')->first();
        self::assertNotNull($runEvent);
        self::assertSame(1, $runEvent->payload['attempted_count'] ?? null);
        self::assertSame(1, $runEvent->payload['failed_count'] ?? null);
        self::assertSame(['TALOS_BROWSER_WORKER_FAILURE'], $runEvent->payload['error_codes'] ?? null);
        $browserEvent = $context['browser']->events()->where('type', 'file_staging.cleanup.failed')->first();
        self::assertNotNull($browserEvent);
        $stageId = collect($this->client->requests)->firstWhere('method', 'stageFile')['stageId'] ?? null;
        self::assertIsString($stageId);
        $wire = json_encode([
            'run' => $runEvent->payload,
            'browser' => $browserEvent->payload,
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString($stageId, $wire);
        self::assertStringNotContainsString('Browser staged file cleanup failed.', $wire);
    }

    public function test_revoked_grant_or_tampered_vault_bytes_fail_before_worker_staging(): void
    {
        $revoked = $this->context();
        $this->app->make(TalosFileAuthorityService::class)->revoke(
            (int) $revoked['user']->id,
            (string) $revoked['grant_id'],
        );
        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $revoked['browser'],
            $revoked['run'],
            new RunEventNormalizer,
            $revoked['call'],
            (string) $revoked['call']->node_id,
        );

        self::assertSame('TALOS_FILE_AUTHORITY_REQUIRED', $payload['error']['code']);
        self::assertFalse(collect($this->client->requests)->contains('method', 'stageFile'));

        $tampered = $this->context('tampered.txt', 'trusted');
        Storage::disk('local')->put((string) $tampered['file']->storage_path, 'changed');
        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $tampered['browser'],
            $tampered['run'],
            new RunEventNormalizer,
            $tampered['call'],
            (string) $tampered['call']->node_id,
        );

        self::assertSame('TALOS_BROWSER_UPLOAD_FILE_INTEGRITY', $payload['error']['code']);
        self::assertFalse(collect($this->client->requests)->contains('method', 'stageFile'));
    }

    public function test_semantic_dot_basename_is_rejected_before_worker_staging(): void
    {
        $context = $this->context();
        $context['file']->forceFill(['original_name' => ' . '])->save();

        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $context['browser'],
            $context['run'],
            new RunEventNormalizer,
            $context['call'],
            (string) $context['call']->node_id,
        );

        self::assertSame('TALOS_BROWSER_UPLOAD_FILE_UNSUPPORTED', $payload['error']['code']);
        self::assertFalse(collect($this->client->requests)->contains('method', 'stageFile'));
    }

    public function test_safe_spaced_basename_is_preserved_through_worker_staging(): void
    {
        $context = $this->context();
        $context['file']->forceFill(['original_name' => ' proof.txt '])->save();
        $this->client->callToolResponse = $this->uploadResult($context);

        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $context['browser'],
            $context['run'],
            new RunEventNormalizer,
            $context['call'],
            (string) $context['call']->node_id,
        );

        self::assertArrayNotHasKey('error', $payload);
        $stage = collect($this->client->requests)->firstWhere('method', 'stageFile');
        self::assertIsArray($stage);
        self::assertSame(' proof.txt ', $stage['file']['name']);
        self::assertSame(' proof.txt ', $payload['observation']['files'][0]['name']);
    }

    public function test_ambiguous_staging_response_releases_every_planned_stage_id(): void
    {
        $context = $this->context();
        $secondPath = 'vault/private/second.txt';
        Storage::disk('local')->put($secondPath, 'second');
        $secondFile = TalosFile::query()->create([
            'user_id' => $context['user']->id,
            'original_name' => 'second.txt',
            'mime_type' => 'text/plain',
            'size_bytes' => 6,
            'checksum' => hash('sha256', 'second'),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => $secondPath,
            'parser' => 'text',
        ]);
        $this->app->make(TalosFileAuthorityService::class)->create((int) $context['user']->id, [
            'scope' => 'file',
            'permissions' => ['browser.upload'],
            'file_ids' => [(string) $secondFile->id],
        ]);
        $arguments = [
            'target' => 'r4',
            'element' => 'Choose file',
            'file_ids' => [(string) $context['file']->id, (string) $secondFile->id],
        ];
        $context['call']->forceFill([
            'arguments' => $arguments,
            'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($arguments)),
        ])->save();
        $this->client->failStageFileCall = 2;

        $payload = $this->app->make(TalosBrowserFileUploadService::class)->execute(
            $context['browser'],
            $context['run'],
            new RunEventNormalizer,
            $context['call']->refresh(),
            (string) $context['call']->node_id,
        );

        self::assertSame('TALOS_BROWSER_UPLOAD_FILE_INTEGRITY', $payload['error']['code']);
        $staging = collect($this->client->requests)->where('method', 'stageFile')->values();
        self::assertCount(2, $staging);
        $cleanup = collect($this->client->requests)->where('method', 'discardStagedFile')->values();
        self::assertCount(2, $cleanup);
        self::assertEqualsCanonicalizing($staging->pluck('stageId')->all(), $cleanup->pluck('stageId')->all());
        self::assertCount(2, array_unique($cleanup->pluck('stageId')->all()));
        self::assertFalse(collect($this->client->requests)->contains('method', 'upload'));
    }

    public function test_agent_backend_executes_the_authorized_upload_and_returns_correlated_evidence(): void
    {
        $context = $this->context();
        TalosMessage::query()->create([
            'session_id' => $context['chat']->id,
            'run_id' => $context['run']->id,
            'role' => 'user',
            'content' => 'Upload proof.txt through the current file chooser.',
        ]);
        $this->client->callToolResponse = $this->uploadResult($context);
        $providerCall = new ToolCall(
            (string) $context['call']->provider_call_id,
            'browser_file_upload',
            $context['call']->arguments,
            null,
            [],
        );
        $executionContext = new ToolExecutionContext(
            userId: (string) $context['user']->id,
            chatSessionId: (string) $context['chat']->id,
            runId: (string) $context['run']->id,
            turnId: (string) $context['turn']->id,
            browserSessionId: (string) $context['browser']->id,
            nodeId: (string) $context['call']->node_id,
            capability: 'browser.upload',
            risk: 'critical',
            stateVersion: 0,
            deadlineAt: now()->addMinute()->toJSON(),
            idempotencyKey: (string) $context['call']->effect_key,
        );
        $node = new ProceduralNode(
            id: (string) $context['call']->node_id,
            type: 'TOOL_BROWSER_FILE_UPLOAD',
            call: $providerCall,
            context: $executionContext,
            dependencies: [],
            fingerprint: (string) $context['call']->fingerprint,
            requiresApproval: true,
            producesEvidence: true,
        );
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);
        $task = $runtime->begin((int) $context['user']->id, $context['run'], $context['browser']);
        $actions = $runtime->prepareActions(
            (int) $context['user']->id,
            $task,
            new ProceduralPlan(ProceduralPlan::AWAITING_APPROVAL, [$node], [$node->id], []),
            [$node->id => $context['call']],
        );
        $action = $runtime->assertCanDispatch(
            (int) $context['user']->id,
            $task,
            $actions[$node->id],
            $context['call'],
            $context['browser'],
        );
        $runtime->markDispatched(
            (int) $context['user']->id,
            $task,
            $action,
            $context['call'],
        );

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $node,
            $context['turn'],
            $context['browser'],
        );

        self::assertFalse($result->isError, json_encode($result->toWireArray(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        self::assertSame('browser_file_upload', $result->structuredContent['tool']);
        self::assertSame(['screenshot', 'snapshot'], array_column($result->evidence, 'kind'));
        self::assertCount(2, $context['run']->artifacts()->whereIn('artifact_type', ['browser_screenshot', 'browser_snapshot'])->get());
        self::assertStringNotContainsString('vault/private/proof.txt', json_encode($result->toWireArray(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    public function test_pending_upload_approval_exposes_safe_preview_and_revocation_blocks_approval(): void
    {
        $context = $this->context();
        $this->actingAs($context['user']);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $context['user']->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Upload approval test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $context['turn']->forceFill([
            'model_profile_id' => $profile->id,
            'status' => 'awaiting_approval',
        ])->save();
        $context['call']->forceFill([
            'status' => 'awaiting_approval',
            'approval_state' => 'awaiting_approval',
            'approval_id' => null,
            'approved_by_user_id' => null,
            'approved_at' => null,
            'execution_token' => null,
            'execution_lease_expires_at' => null,
        ])->save();

        $this->getJson("/api/talos/sessions/{$context['chat']->id}/pending-tool-approvals")
            ->assertOk()
            ->assertJsonPath('data.0.tool_name', 'browser_file_upload')
            ->assertJsonPath('data.0.risk', 'critical')
            ->assertJsonPath('data.0.capability', 'browser.upload')
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.actionable', true)
            ->assertJsonPath('data.0.target.ref', 'r4')
            ->assertJsonPath('data.0.files.0.file_id', (string) $context['file']->id)
            ->assertJsonPath('data.0.files.0.name', 'proof.txt')
            ->assertJsonMissingPath('data.0.files.0.storage_path');

        $this->app->make(TalosFileAuthorityService::class)->revoke(
            (int) $context['user']->id,
            (string) $context['grant_id'],
        );
        $this->postJson("/api/talos/agent-turns/{$context['turn']->id}/approvals/{$context['call']->id}", [
            'decision' => 'approve',
            'plan_hash' => (string) $context['call']->approval_payload_sha256,
        ])->assertConflict()
            ->assertJsonPath('code', 'TALOS_TOOL_APPROVAL_CONFLICT');

        self::assertSame('awaiting_approval', $context['call']->refresh()->approval_state);
        self::assertFalse(collect($this->client->requests)->contains('method', 'stageFile'));
    }

    /** @return array{user: User, chat: TalosSession, run: TalosRun, browser: TalosBrowserSession, snapshot: TalosBrowserArtifact, file: TalosFile, grant_id: string, turn: TalosToolTurn, call: TalosToolCall} */
    private function context(string $fileName = 'proof.txt', string $contents = 'proof'): array
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Upload authority',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Upload the file.'),
            'prompt' => 'Upload the file.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-upload-'.str()->uuid(),
            'status' => 'active',
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
        $snapshotJson = json_encode([
            'format' => 'accessibility_refs_v1',
            'snapshotId' => 'snap_upload-1',
            'url' => 'https://example.com/upload',
            'title' => 'Upload form',
            'textDigest' => 'Choose a file',
            'nodes' => [['ref' => 'r4', 'role' => 'button', 'name' => 'Choose file', 'visible' => true]],
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $snapshot = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $browser,
            'snapshot',
            'application/json',
            $snapshotJson,
            ['url' => $browser->current_url, 'title' => $browser->current_title],
            ['source_state_version' => 0, 'state_version' => 0, 'trust_boundary' => 'untrusted_browser_content'],
        );
        $browser->forceFill(['last_snapshot_artifact_id' => $snapshot->id])->save();

        $path = 'vault/private/'.$fileName;
        Storage::disk('local')->put($path, $contents);
        $file = TalosFile::query()->create([
            'user_id' => $user->id,
            'original_name' => $fileName,
            'mime_type' => 'text/plain',
            'size_bytes' => strlen($contents),
            'checksum' => hash('sha256', $contents),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'parser' => 'text',
        ]);
        $grant = $this->app->make(TalosFileAuthorityService::class)->create((int) $user->id, [
            'scope' => 'file',
            'permissions' => ['browser.upload'],
            'file_ids' => [(string) $file->id],
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'browser_session_id' => $browser->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'test',
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'revision' => 0,
            'started_at' => now(),
        ]);
        $identity = $fileName === 'proof.txt' ? '1' : substr(hash('sha256', $fileName), 0, 12);
        $arguments = ['target' => 'r4', 'element' => 'Choose file', 'file_ids' => [(string) $file->id]];
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-upload-'.$identity,
            'provider_call_id' => 'provider-upload-'.$identity,
            'node_id' => 'node-upload-'.$identity,
            'node_type' => 'TOOL_BROWSER_FILE_UPLOAD',
            'tool_name' => 'browser_file_upload',
            'arguments' => $arguments,
            'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($arguments)),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'upload-call'),
            'state_version' => 0,
            'evidence_hash' => 'sha256:'.$snapshot->sha256,
            'evidence_snapshot_artifact_id' => $snapshot->id,
            'evidence_snapshot_id' => 'snap_upload-1',
            'risk' => 'critical',
            'capability' => 'browser.upload',
            'status' => 'running',
            'attempt' => 0,
            'execution_token' => 'execution-lease-upload',
            'execution_lease_expires_at' => now()->addMinute(),
            'effect_key' => 'sha256:'.hash('sha256', 'upload-effect'),
            'effect_status' => 'in_flight',
            'approval_state' => 'claimed',
            'approval_id' => 'approval-upload-'.$identity,
            'approval_payload_sha256' => 'sha256:'.str_repeat('a', 64),
            'approved_by_user_id' => $user->id,
            'approved_at' => now(),
        ]);

        return ['user' => $user, 'chat' => $chat, 'run' => $run, 'browser' => $browser, 'snapshot' => $snapshot, 'file' => $file, 'grant_id' => (string) $grant->id, 'turn' => $turn, 'call' => $call];
    }

    /** @param array<string, mixed> $context */
    private function uploadResult(array $context): BrowserToolResult
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
        self::assertIsString($png);
        $snapshot = [
            'snapshot_id' => 'snap_upload-2',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Selected proof.txt',
            'nodes' => [['ref' => 'r4', 'role' => 'button', 'name' => 'proof.txt', 'visible' => true]],
        ];
        $snapshotJson = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $screenshotHash = 'sha256:'.hash('sha256', $png);
        $snapshotHash = 'sha256:'.hash('sha256', $snapshotJson);
        $evidence = [
            ['artifact_id' => 'shot-upload-1', 'kind' => 'screenshot', 'sha256' => $screenshotHash, 'trusted_boundary' => 'untrusted_browser_content'],
            ['artifact_id' => 'snap-upload-1', 'kind' => 'snapshot', 'sha256' => $snapshotHash, 'trusted_boundary' => 'untrusted_browser_content'],
        ];

        return BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => (string) $context['call']->provider_call_id,
            'isError' => false,
            'content' => [
                ['type' => 'text', 'text' => 'Uploaded proof.txt'],
                ['type' => 'image', 'data' => base64_encode($png), 'mimeType' => 'image/png'],
            ],
            'structuredContent' => [
                'url' => 'https://example.com/upload',
                'title' => 'Upload form',
                'state_version' => 1,
                'evidence_ids' => ['shot-upload-1', 'snap-upload-1'],
                'target' => ['ref' => 'r4', 'role' => 'button', 'name' => 'Choose file'],
                'files' => [[
                    'file_id' => (string) $context['file']->id,
                    'name' => (string) $context['file']->original_name,
                    'mime_type' => (string) $context['file']->mime_type,
                    'size_bytes' => (int) $context['file']->size_bytes,
                    'sha256' => 'sha256:'.(string) $context['file']->checksum,
                ]],
                'screenshot' => ['mime_type' => 'image/png', 'width' => 1, 'height' => 1, 'sha256' => $screenshotHash],
                'snapshot' => [...$snapshot, 'sha256' => $snapshotHash],
            ],
            'evidence' => $evidence,
        ], (string) $context['call']->provider_call_id);
    }
}
