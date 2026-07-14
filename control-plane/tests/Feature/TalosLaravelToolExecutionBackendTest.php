<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Agent\TalosLaravelToolExecutionBackend;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Web\TalosWebFetchService;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolExecutionContext;
use Tests\TestCase;

final class TalosLaravelToolExecutionBackendTest extends TestCase
{
    use RefreshDatabase;

    public function test_browser_snapshot_dispatches_through_the_canonical_command_and_returns_verified_evidence(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );

        $this->assertFalse($result->isError, json_encode($result->structuredContent));
        $this->assertNotEmpty($result->evidence);
        $this->assertSame(
            $result->evidence[0]['artifact_id'],
            $result->structuredContent['evidence_ids'][0],
        );
        $this->assertSame('browser_snapshot', $result->structuredContent['tool']);
        $this->assertIsInt($result->structuredContent['evidence_bytes'] ?? null);
        $this->assertGreaterThan(0, $result->structuredContent['evidence_bytes']);
        $this->assertSame('browser_snapshot', collect($client->requests)->last()['name']);
        $browserArtifact = TalosBrowserArtifact::query()
            ->whereKey($result->evidence[0]['artifact_id'])
            ->where('browser_session_id', $browser->id)
            ->where('user_id', $user->id)
            ->first();
        $this->assertInstanceOf(TalosBrowserArtifact::class, $browserArtifact);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'run_id' => $run->id,
            'uri' => 'talos-browser-artifact://'.$browserArtifact->id,
        ]);
    }

    public function test_browser_navigation_uses_the_registry_evidence_contract_and_persists_run_scoped_evidence(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_navigate', ['url' => 'https://example.com/']),
            $turn,
            $browser,
        );

        $this->assertFalse($result->isError, json_encode($result->structuredContent));
        $artifactId = $result->evidence[0]['artifact_id'] ?? null;
        $this->assertIsString($artifactId);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'id' => $artifactId,
            'run_id' => $run->id,
            'artifact_type' => 'browser_navigation',
        ]);
        $this->assertSame('browser_navigate', collect($client->requests)->last()['name']);
        $this->assertSame($user->id, TalosRun::query()->findOrFail($run->id)->user_id);
    }

    public function test_browser_read_uses_the_owner_scoped_current_snapshot_hash(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(
            resolver: static fn (): array => ['93.184.216.34'],
        ));

        $snapshot = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );
        $this->assertFalse($snapshot->isError, json_encode($snapshot->structuredContent));

        $browser->refresh();
        $read = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_read', ['ref' => 'r1']),
            $turn,
            $browser,
        );

        $this->assertFalse($read->isError, json_encode($read->structuredContent));
        $request = collect($client->requests)->last();
        $this->assertSame('browser_read', $request['name']);
        $this->assertSame($browser->last_snapshot_artifact_id, $read->structuredContent['used_browser_context']['snapshot_artifact_id']);
        $this->assertSame(
            'sha256:'.TalosBrowserArtifact::query()->findOrFail($browser->last_snapshot_artifact_id)->sha256,
            $read->structuredContent['used_browser_context']['evidence_hash'],
        );
    }

    public function test_browser_click_binds_the_model_ref_to_server_snapshot_state_and_persists_post_action_evidence(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_cookie-banner',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Cookie preferences Accept all',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->app->instance(BrowserSessionClient::class, $client);

        $backend = $this->app->make(TalosLaravelToolExecutionBackend::class);
        $snapshot = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );
        $this->assertFalse($snapshot->isError, json_encode($snapshot->structuredContent));
        $browser->refresh();

        $click = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_click', [
                'target' => 'r1',
                'element' => 'Accept all cookie preferences',
            ]),
            $turn,
            $browser,
        );

        $this->assertFalse($click->isError, json_encode($click->structuredContent));
        $request = collect($client->requests)->last();
        $this->assertSame('browser_click', $request['name']);
        $this->assertSame([
            'target' => 'r1',
            'element' => 'Accept all',
            'snapshot_id' => 'snap_cookie-banner',
            'state_version' => 0,
        ], $request['arguments']);
        $this->assertSame(1, $browser->refresh()->worker_state_version);
        $this->assertCount(2, $click->evidence);
        $this->assertSame(['screenshot', 'snapshot'], array_column($click->evidence, 'kind'));
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
            'source_command_id' => 'call_browser_click',
            'state_version' => 1,
        ]);
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'browser_session_id' => $browser->id,
            'type' => 'snapshot',
            'source_command_id' => 'call_browser_click',
            'state_version' => 1,
        ]);
        $this->assertSame($user->id, $browser->user_id);
    }

    public function test_browser_click_rejects_a_ref_missing_from_owned_snapshot_before_worker_dispatch(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_owned-target',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Cookie preferences Accept all',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->app->instance(BrowserSessionClient::class, $client);

        $backend = $this->app->make(TalosLaravelToolExecutionBackend::class);
        $snapshot = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );
        $this->assertFalse($snapshot->isError, json_encode($snapshot->structuredContent));
        $browser->refresh();
        $requestCount = count($client->requests);

        $click = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_click', ['target' => 'r99']),
            $turn,
            $browser,
        );

        $this->assertTrue($click->isError);
        $this->assertSame('TALOS_BROWSER_STALE_REF', $click->structuredContent['code']);
        $this->assertCount($requestCount, $client->requests);
        $this->assertSame($user->id, $browser->user_id);
    }

    public function test_browser_click_transport_ambiguity_is_not_retried_and_requires_recovery(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_transport-ambiguity',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Accept all',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->app->instance(BrowserSessionClient::class, $client);

        $backend = $this->app->make(TalosLaravelToolExecutionBackend::class);
        $snapshot = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );
        $this->assertFalse($snapshot->isError, json_encode($snapshot->structuredContent));
        $browser->refresh();
        $requestCount = count($client->requests);
        $client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Worker response was lost.');

        $click = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_click', ['target' => 'r1']),
            $turn,
            $browser,
        );

        $this->assertTrue($click->isError);
        $this->assertSame('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', $click->structuredContent['code']);
        $this->assertCount($requestCount + 1, $client->requests);
        $this->assertSame('recovery_required', $browser->refresh()->status);
        $this->assertSame($user->id, $browser->user_id);
    }

    public function test_browser_click_with_incomplete_post_action_evidence_requires_recovery(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'snapshot_id' => 'snap_evidence-source',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Accept all',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->app->instance(BrowserSessionClient::class, $client);

        $backend = $this->app->make(TalosLaravelToolExecutionBackend::class);
        $snapshotResult = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot'),
            $turn,
            $browser,
        );
        $this->assertFalse($snapshotResult->isError, json_encode($snapshotResult->structuredContent));
        $browser->refresh();

        $screenshotBytes = 'fake png bytes after click';
        $postSnapshot = [
            'snapshot_id' => 'snap_evidence-result',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Cookie banner dismissed',
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Cookie banner dismissed', 'visible' => true]],
        ];
        $snapshotHash = 'sha256:'.hash('sha256', json_encode($postSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $postSnapshot['sha256'] = $snapshotHash;
        $screenshotHash = 'sha256:'.hash('sha256', $screenshotBytes);
        $client->callToolResponse = BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => 'call_browser_click',
            'isError' => false,
            'content' => [
                ['type' => 'text', 'text' => 'Click completed.'],
                ['type' => 'image', 'data' => base64_encode($screenshotBytes), 'mimeType' => 'image/png'],
            ],
            'structuredContent' => [
                'url' => 'https://example.com',
                'title' => 'Example page',
                'state_version' => 1,
                'target' => ['ref' => 'r1', 'role' => 'button', 'name' => 'Accept all'],
                'screenshot' => ['mime_type' => 'image/png', 'width' => 1280, 'height' => 800, 'sha256' => $screenshotHash],
                'snapshot' => $postSnapshot,
                'evidence_ids' => ['screenshot-evidence', 'snapshot-evidence'],
            ],
            'evidence' => [
                ['artifact_id' => 'screenshot-evidence', 'kind' => 'screenshot', 'sha256' => $screenshotHash, 'trusted_boundary' => 'untrusted_web_content'],
                ['artifact_id' => 'snapshot-evidence', 'kind' => 'not-a-snapshot', 'sha256' => $snapshotHash, 'trusted_boundary' => 'untrusted_web_content'],
            ],
        ], 'call_browser_click');

        $click = $backend->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_click', ['target' => 'r1']),
            $turn,
            $browser,
        );

        $this->assertTrue($click->isError);
        $this->assertSame('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', $click->structuredContent['code']);
        $this->assertSame('recovery_required', $browser->refresh()->status);
        $this->assertDatabaseCount('talos_browser_artifacts', 1);
        $this->assertSame($user->id, $browser->user_id);
    }

    public function test_cross_owner_context_is_rejected_before_dispatch(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $other = User::factory()->create();
        $foreignBrowser = TalosBrowserSession::query()->create([
            'user_id' => $other->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'foreign-worker',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['accessibilitySnapshot' => true],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $foreignBrowser, 'browser_snapshot'),
            $turn,
            $foreignBrowser,
        );

        $this->assertTrue($result->isError);
        $this->assertSame('TALOS_TOOL_OWNERSHIP_MISMATCH', $result->structuredContent['code']);
        $this->assertSame([], $client->requests);
    }

    public function test_provider_cannot_spoof_server_owned_browser_state_or_timeout_fields(): void
    {
        [$user, $chat, $run, $turn, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, $browser, 'browser_snapshot', [
                'state_version' => 999,
                'timeoutMs' => 120000,
            ]),
            $turn,
            $browser,
        );

        $this->assertTrue($result->isError);
        $this->assertSame('TALOS_BROWSER_COMMAND_MALFORMED', $result->structuredContent['code']);
        $this->assertSame([], $client->requests);
    }

    public function test_unavailable_web_search_and_invalid_web_fetch_are_controlled_tool_errors(): void
    {
        [$user, $chat, $run, $turn] = $this->context();
        $search = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, null, 'web_search', ['query' => 'AVM']),
            $turn,
        );
        $fetch = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, null, 'web_fetch', ['url' => '']),
            $turn,
        );

        $this->assertTrue($search->isError);
        $this->assertStringStartsWith('TALOS_WEB_SEARCH_', $search->structuredContent['code']);
        $this->assertTrue($fetch->isError);
        $this->assertSame('TALOS_WEB_FETCH_URL_BLOCKED', $fetch->structuredContent['code']);
    }

    public function test_web_search_success_maps_provider_results_to_canonical_evidence(): void
    {
        [$user, $chat, $run, $turn] = $this->context();
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'nodes' => [[
                'role' => 'link',
                'name' => 'Fixture result',
                'href' => 'https://example.com/result',
            ]],
        ];
        $this->app->instance(WebSearchProviderFactory::class, new WebSearchProviderFactory($client, [
            'provider' => 'browser',
            'browser' => ['enabled' => true, 'origin' => 'https://search.example/search'],
        ]));

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, null, 'web_search', ['query' => 'AVM']),
            $turn,
        );

        $this->assertFalse($result->isError);
        $this->assertSame('Fixture result', $result->structuredContent['results'][0]['title']);
        $this->assertSame('search_result', $result->evidence[0]['kind']);
        $this->assertSame('talos-user:'.$user->id, $client->requests[0]['ownerRef']);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'id' => $result->evidence[0]['artifact_id'],
            'run_id' => $run->id,
            'artifact_type' => 'web_search_result',
        ]);
    }

    public function test_web_fetch_success_maps_untrusted_body_to_canonical_evidence_without_network(): void
    {
        [$chat, $run, $turn] = array_slice($this->context(), 1, 3);
        $policy = PublicHttpUrlPolicy::forProviderHosts(['docs.example'], static fn (string $host): array => ['93.184.216.34']);
        $this->app->instance(TalosWebFetchService::class, new TalosWebFetchService(
            $policy,
            new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: false),
            static fn (): string => '2026-07-13T12:00:00+00:00',
            static fn (): float => 100.0,
        ));
        Http::fake(['https://docs.example/page' => Http::response('Fixture body.', 200, ['Content-Type' => 'text/plain'])]);

        $result = $this->app->make(TalosLaravelToolExecutionBackend::class)->execute(
            $this->node($turn, $chat, $run, null, 'web_fetch', ['url' => 'https://docs.example/page']),
            $turn,
        );

        $this->assertFalse($result->isError);
        $this->assertSame('Fixture body.', $result->structuredContent['content']);
        $this->assertSame('web_fetch', $result->evidence[0]['kind']);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'id' => $result->evidence[0]['artifact_id'],
            'run_id' => $run->id,
            'artifact_type' => 'web_fetch',
        ]);
    }

    /** @return array{User, TalosSession, TalosRun, TalosToolTurn, TalosBrowserSession} */
    private function context(): array
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Tool backend',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Tool backend'),
            'prompt' => 'Tool backend',
            'provider' => 'test',
            'model' => 'test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'run_id' => $run->id,
            'status' => 'awaiting_tool_results',
            'provider' => 'test',
            'model' => 'test',
            'adapter_version' => 'test_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 8],
            'budget_usage' => [],
            'started_at' => now(),
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-owned',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'hmiActions' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);

        return [$user, $chat, $run, $turn, $browser];
    }

    /** @param array<string, mixed> $arguments */
    private function node(TalosToolTurn $turn, TalosSession $chat, TalosRun $run, ?TalosBrowserSession $browser, string $tool, array $arguments = []): ProceduralNode
    {
        $nodeId = 'node_'.str_replace('-', '_', $tool);
        $call = new ToolCall('call_'.$tool, $tool, $arguments, null, []);
        $context = new ToolExecutionContext(
            userId: (string) $turn->user_id,
            chatSessionId: (string) $chat->id,
            runId: (string) $run->id,
            turnId: (string) $turn->id,
            browserSessionId: $browser?->id,
            nodeId: $nodeId,
            capability: $tool === 'browser_click' ? 'browser.write' : (str_starts_with($tool, 'browser_') ? 'browser.read' : ($tool === 'web_search' ? 'web.search' : 'web.fetch')),
            risk: $tool === 'browser_click' ? 'high' : 'low',
            stateVersion: (int) ($browser?->worker_state_version ?? 0),
            deadlineAt: now()->addMinute()->toJSON(),
            idempotencyKey: 'sha256:'.hash('sha256', $nodeId),
        );

        $node = new ProceduralNode(
            id: $nodeId,
            type: match ($tool) {
                'browser_snapshot' => 'TOOL_BROWSER_SNAPSHOT',
                'browser_read' => 'TOOL_BROWSER_READ',
                'browser_click' => 'TOOL_BROWSER_CLICK',
                'web_search' => 'TOOL_WEB_SEARCH',
                'web_fetch' => 'TOOL_WEB_FETCH',
                default => 'TOOL_BROWSER_NAVIGATE',
            },
            call: $call,
            context: $context,
            dependencies: [],
            fingerprint: 'sha256:'.hash('sha256', $nodeId),
            requiresApproval: $tool === 'browser_click',
            producesEvidence: true,
        );

        if ($tool === 'browser_click' && $browser instanceof TalosBrowserSession) {
            $browser->refresh();
            $artifact = TalosBrowserArtifact::query()
                ->whereKey($browser->last_snapshot_artifact_id)
                ->where('browser_session_id', $browser->id)
                ->where('user_id', $turn->user_id)
                ->where('type', 'snapshot')
                ->firstOrFail();
            $snapshotId = is_array($artifact->metadata) && is_string($artifact->metadata['snapshot_id'] ?? null)
                ? $artifact->metadata['snapshot_id']
                : null;
            $this->assertIsString($snapshotId);
            $turn->calls()->updateOrCreate(
                ['provider_call_id' => $call->providerCallId],
                [
                    'run_id' => $run->id,
                    'user_id' => $turn->user_id,
                    'sequence' => 1,
                    'logical_call_id' => $call->providerCallId,
                    'node_id' => $nodeId,
                    'tool_name' => $tool,
                    'node_type' => 'TOOL_BROWSER_CLICK',
                    'arguments' => $arguments,
                    'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($arguments)),
                    'dependencies' => [],
                    'fingerprint' => $node->fingerprint,
                    'state_version' => (int) $browser->worker_state_version,
                    'evidence_hash' => 'sha256:'.$artifact->sha256,
                    'evidence_snapshot_artifact_id' => $artifact->id,
                    'evidence_snapshot_id' => $snapshotId,
                    'risk' => 'high',
                    'capability' => 'browser.write',
                    'status' => 'running',
                    'attempt' => 0,
                    'approval_state' => 'claimed',
                ],
            );
        }

        return $node;
    }
}
