<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Runs\RunEventNormalizer;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserCommand;
use App\Services\Talos\Browser\TalosBrowserCommandService;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserSnapshotEvidence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosBrowserCanonicalToolDispatchTest extends TestCase
{
    use RefreshDatabase;

    public function test_breg_016_snapshot_evidence_contract_is_versioned_and_jcs_compatible(): void
    {
        $nodes = [
            ['ref' => 'r1', 'role' => 'link', 'name' => 'Vehicle A', 'href' => 'https://example.com/a?b=1', 'level' => 2, 'visible' => true],
            ['ref' => 'r2', 'role' => 'button', 'name' => 'Open', 'visible' => false],
        ];

        $this->assertSame('talos_browser_tool_snapshot_evidence_v1', TalosBrowserSnapshotEvidence::SCHEMA_VERSION);
        $this->assertSame(
            'sha256:4beed7f36e687158638ee32491a5e1f13e787095de0568a8b10ddfda41366f38',
            TalosBrowserSnapshotEvidence::sha256(
                snapshotId: 'snap_conformance-1',
                format: 'accessibility_refs_v1',
                textDigest: 'digest-123',
                nodes: $nodes,
            ),
        );
    }

    public function test_canonical_read_input_can_bind_the_physical_command_to_a_persisted_tool_call_id(): void
    {
        $command = TalosBrowserCommand::canonicalReadInput(
            runId: 'run-1',
            browserSessionId: 'browser-1',
            operation: 'snapshot',
            arguments: [],
            commandId: 'provider-call-1',
        );

        self::assertSame('provider-call-1', $command['command_id']);
        self::assertSame(
            TalosBrowserCommand::canonicalReadInput('run-1', 'browser-1', 'snapshot', [])['idempotency_key'],
            $command['idempotency_key'],
        );
    }

    public function test_navigation_uses_the_canonical_worker_tool_and_persists_its_state_version(): void
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Canonical tool dispatch',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-canonical-tool',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Open example.com.'),
            'prompt' => 'Open example.com.',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $command = TalosBrowserCommand::canonicalReadInput(
            $run->id,
            $browser->id,
            'navigate',
            ['url' => 'https://example.com/'],
        );
        $navigationSource = ['url' => 'https://example.com/', 'title' => 'Example Domain', 'state_version' => 1];
        $sourceHash = 'sha256:'.hash('sha256', json_encode($navigationSource, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'Browser navigation completed.']],
            'structuredContent' => [
                'url' => 'https://example.com/',
                'title' => 'Example Domain',
                'state_version' => 1,
                'evidence_ids' => ['navigation-evidence'],
            ],
            'evidence' => [[
                'artifact_id' => 'navigation-evidence',
                'kind' => 'navigation',
                'sha256' => $sourceHash,
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        ], $command['command_id']);
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $result = $this->app->make(TalosBrowserCommandService::class)->execute(
            $browser,
            $run,
            $command,
            new RunEventNormalizer(),
        );

        $this->assertArrayNotHasKey('error', $result);
        $request = collect($client->requests)->firstWhere('transport_method', 'callTool');
        $this->assertIsArray($request);
        $this->assertSame('browser_navigate', $request['name']);
        $this->assertSame(['url' => 'https://example.com/', 'state_version' => 0], $request['arguments']);
        $this->assertSame(1, $browser->refresh()->worker_state_version);
        $event = $run->events()->where('event_type', 'browser.command.succeeded')->firstOrFail();
        $this->assertSame($sourceHash, $event->payload['worker_evidence'][0]['sha256'] ?? null);
    }

    public function test_an_older_worker_response_cannot_regress_persisted_browser_state(): void
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create(['user_id' => $user->id, 'title' => 'Out of order state', 'mode' => 'verified_execution', 'surface' => 'chat']);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-out-of-order',
            'status' => 'active',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Snapshot.'),
            'prompt' => 'Snapshot.',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $command = TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'snapshot', []);
        $sourceHash = TalosBrowserSnapshotEvidence::sha256(
            snapshotId: 'snap_out-of-order',
            format: 'accessibility_refs_v1',
            textDigest: '',
            nodes: [],
        );
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'Browser snapshot captured.']],
            'structuredContent' => [
                'url' => 'https://example.com/',
                'title' => 'Example Domain',
                'state_version' => 0,
                'snapshot_id' => 'snap_out-of-order',
                'format' => 'accessibility_refs_v1',
                'text_digest' => '',
                'nodes' => [],
                'evidence_ids' => ['snapshot-source'],
            ],
            'evidence' => [[
                'artifact_id' => 'snapshot-source',
                'kind' => 'snapshot',
                'sha256' => $sourceHash,
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        ], $command['command_id']);
        $client->afterRequest = static function (string $method) use ($browser): void {
            if ($method === 'snapshot') {
                TalosBrowserSession::query()->whereKey($browser->id)->update(['worker_state_version' => 5]);
            }
        };
        $this->app->instance(BrowserSessionClient::class, $client);

        $result = $this->app->make(TalosBrowserCommandService::class)->execute($browser, $run, $command, new RunEventNormalizer());

        $this->assertSame('TALOS_BROWSER_STALE_STATE', $result['error']['code'] ?? null);
        $this->assertSame(5, $browser->refresh()->worker_state_version);
    }

    public function test_mismatched_worker_evidence_fails_closed_before_success_is_persisted(): void
    {
        [$browser, $run] = $this->context('mismatched-evidence');
        $command = TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'navigate', ['url' => 'https://example.com/']);
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'Browser navigation completed.']],
            'structuredContent' => [
                'url' => 'https://example.com/',
                'title' => 'Example Domain',
                'state_version' => 1,
                'evidence_ids' => ['tampered-navigation'],
            ],
            'evidence' => [[
                'artifact_id' => 'tampered-navigation',
                'kind' => 'navigation',
                'sha256' => 'sha256:'.str_repeat('f', 64),
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        ], $command['command_id']);
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(resolver: static fn (): array => ['93.184.216.34']));

        $result = $this->app->make(TalosBrowserCommandService::class)->execute($browser, $run, $command, new RunEventNormalizer());

        $this->assertSame('TALOS_BROWSER_WORKER_FAILURE', $result['error']['code'] ?? null);
        $this->assertSame(1, $browser->refresh()->worker_state_version);
        $this->assertFalse($run->events()->where('event_type', 'browser.command.succeeded')->exists());
    }

    public function test_worker_error_without_transition_evidence_cannot_advance_persisted_state(): void
    {
        [$browser, $run] = $this->context('unattested-error-state');
        $command = TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'navigate', ['url' => 'https://example.com/']);
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => true,
            'content' => [['type' => 'text', 'text' => 'The browser tool failed.']],
            'structuredContent' => [
                'code' => 'TALOS_BROWSER_TOOL_EXECUTION_FAILED',
                'message' => 'The browser tool failed.',
                'state_version' => 7,
            ],
            'evidence' => [],
        ], $command['command_id']);
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $result = $this->app->make(TalosBrowserCommandService::class)->execute(
            $browser,
            $run,
            $command,
            new RunEventNormalizer(),
        );

        $this->assertSame('TALOS_BROWSER_TOOL_EXECUTION_FAILED', $result['error']['code'] ?? null);
        $this->assertSame(0, $browser->refresh()->worker_state_version);
        $this->assertFalse($run->events()->where('event_type', 'browser.command.succeeded')->exists());
    }

    public function test_tampered_snapshot_bytes_require_recovery_before_browser_read_parsing(): void
    {
        $this->useIsolatedLocalStorage();
        [$browser, $run] = $this->context('tampered-read-artifact');
        $service = $this->app->make(TalosBrowserCommandService::class);
        $snapshot = $service->execute(
            $browser,
            $run,
            TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'snapshot', []),
            new RunEventNormalizer(),
        );
        $this->assertArrayNotHasKey('error', $snapshot);
        $artifact = $browser->refresh()->artifacts()->where('type', 'snapshot')->latest()->firstOrFail();
        $bytes = Storage::disk($artifact->storage_disk)->get($artifact->storage_path);
        Storage::disk($artifact->storage_disk)->put(
            $artifact->storage_path,
            str_replace('Example page', 'Example pagf', $bytes),
        );

        $result = $service->execute(
            $browser,
            $run,
            TalosBrowserCommand::canonicalReadInput(
                $run->id,
                $browser->id,
                'read',
                ['query' => 'Example'],
                'sha256:'.$artifact->sha256,
            ),
            new RunEventNormalizer(),
        );

        $this->assertSame('TALOS_BROWSER_RECOVERY_REQUIRED', $result['error']['code'] ?? null);
        $this->assertSame('recovery_required', $browser->refresh()->status);
        $this->assertDatabaseHas('talos_browser_events', [
            'browser_session_id' => $browser->id,
            'type' => 'artifact.integrity_failed',
        ]);
    }

    public function test_reconcile_never_regresses_a_newer_persisted_worker_state(): void
    {
        [$browser] = $this->context('reconcile-monotonic');
        $browser->update(['worker_state_version' => 5]);
        $client = new FakeBrowserSessionClient();
        $client->inspectResponse = [
            'status' => 'active',
            'mode' => 'read_only',
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'stateVersion' => 3,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $this->app->instance(BrowserSessionClient::class, $client);

        $this->app->make(TalosBrowserCommandService::class)->reconcile($browser);

        $this->assertSame(5, $browser->refresh()->worker_state_version);
    }

    public function test_a_late_worker_response_cannot_claim_a_state_version_already_written_by_another_operation(): void
    {
        [$browser, $run] = $this->context('exact-cas');
        $command = TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'navigate', ['url' => 'https://example.com/']);
        $navigationSource = ['url' => 'https://example.com/', 'title' => 'Example Domain', 'state_version' => 1];
        $sourceHash = 'sha256:'.hash('sha256', json_encode($navigationSource, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'Browser navigation completed.']],
            'structuredContent' => [...$navigationSource, 'evidence_ids' => ['navigation-exact-cas']],
            'evidence' => [[
                'artifact_id' => 'navigation-exact-cas',
                'kind' => 'navigation',
                'sha256' => $sourceHash,
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        ], $command['command_id']);
        $client->afterRequest = static function (string $method) use ($browser): void {
            if ($method === 'navigate') {
                TalosBrowserSession::query()->whereKey($browser->id)->update(['worker_state_version' => 1]);
            }
        };
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $result = $this->app->make(TalosBrowserCommandService::class)->execute(
            $browser,
            $run,
            $command,
            new RunEventNormalizer(),
        );

        $this->assertSame('TALOS_BROWSER_STALE_STATE', $result['error']['code'] ?? null);
        $this->assertFalse($run->events()->where('event_type', 'browser.command.succeeded')->exists());
        $this->assertSame(1, $browser->refresh()->worker_state_version);
    }

    public function test_recovery_required_rejects_every_canonical_command_before_worker_dispatch(): void
    {
        [$browser, $run] = $this->context('recovery-required');
        $browser->update(['status' => 'recovery_required']);
        $client = new FakeBrowserSessionClient();
        $this->app->instance(BrowserSessionClient::class, $client);
        $service = $this->app->make(TalosBrowserCommandService::class);

        foreach ([
            ['navigate', ['url' => 'https://example.com/'], null],
            ['snapshot', [], null],
            ['screenshot', [], null],
            ['read', ['ref' => 'r1'], 'sha256:'.str_repeat('a', 64)],
        ] as [$operation, $arguments, $expectedEvidenceHash]) {
            $result = $service->execute(
                $browser,
                $run,
                TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, $operation, $arguments, $expectedEvidenceHash),
                new RunEventNormalizer(),
            );

            $this->assertSame('TALOS_BROWSER_INVALID_STATE', $result['error']['code'] ?? null, $operation);
            $this->assertSame(409, $result['error']['status'] ?? null, $operation);
        }

        $this->assertSame([], $client->requests);
    }

    public function test_a_canonical_snapshot_cas_failure_returns_409_even_when_artifact_cleanup_fails(): void
    {
        [$browser, $run] = $this->context('snapshot-cas-cleanup');
        $command = TalosBrowserCommand::canonicalReadInput($run->id, $browser->id, 'snapshot', []);
        $sourceHash = TalosBrowserSnapshotEvidence::sha256(
            snapshotId: 'snap_cas-cleanup',
            format: 'accessibility_refs_v1',
            textDigest: '',
            nodes: [],
        );
        $client = new FakeBrowserSessionClient();
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $command['command_id'],
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'Browser snapshot captured.']],
            'structuredContent' => [
                'url' => 'https://example.com/',
                'title' => 'Example Domain',
                'state_version' => 0,
                'snapshot_id' => 'snap_cas-cleanup',
                'format' => 'accessibility_refs_v1',
                'text_digest' => '',
                'nodes' => [],
                'evidence_ids' => ['snapshot-cas-cleanup'],
            ],
            'evidence' => [[
                'artifact_id' => 'snapshot-cas-cleanup',
                'kind' => 'snapshot',
                'sha256' => $sourceHash,
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        ], $command['command_id']);
        $this->app->instance(BrowserSessionClient::class, $client);

        $listening = true;
        DB::listen(function ($query) use ($browser, &$listening): void {
            if ($listening && str_contains(strtolower($query->sql), 'insert into "talos_browser_artifacts"')) {
                $listening = false;
                TalosBrowserSession::query()->whereKey($browser->id)->update(['worker_state_version' => 1]);
            }
        });
        $realDisk = Storage::disk('local');
        $disk = \Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('delete')->once()->andThrow(new \RuntimeException('cleanup failed'));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        try {
            $result = $this->app->make(TalosBrowserCommandService::class)->execute(
                $browser,
                $run,
                $command,
                new RunEventNormalizer(),
            );
        } finally {
            $listening = false;
        }

        $this->assertSame('TALOS_BROWSER_STALE_STATE', $result['error']['code'] ?? null);
        $this->assertSame(409, $result['error']['status'] ?? null);
        $this->assertSame(1, $browser->refresh()->worker_state_version);
    }

    /** @return array{TalosBrowserSession, TalosRun} */
    private function context(string $suffix): array
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create(['user_id' => $user->id, 'title' => 'Canonical '.$suffix, 'mode' => 'verified_execution', 'surface' => 'chat']);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', $suffix),
            'prompt' => $suffix,
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$browser, $run];
    }
}
