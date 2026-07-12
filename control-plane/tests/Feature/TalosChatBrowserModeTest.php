<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserEvent;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosChatBrowserModeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private FakeBrowserSessionClient $client;
    private ?TalosSession $currentChatSession = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->client = new FakeBrowserSessionClient();
        $this->app->instance(BrowserSessionClient::class, $this->client);
        config(['services.avm_validator.url' => 'http://validator.test']);
    }

    public function test_disabled_browser_mode_does_not_expose_browser_tools(): void
    {
        $chat = $this->chatSession();
        Http::fake(['validator.test/chat' => Http::response(['text' => 'No browsing'])]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Answer without browsing.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => false],
        ])->assertOk()->assertJsonPath('browser_activities', [])->assertJsonPath('used_browser_context', null);

        Http::assertSent(fn ($request): bool => data_get($request->data(), 'tool_context.browser_mode') === null);
    }

    public function test_browser_mode_requires_an_owned_operable_browser_session(): void
    {
        $chat = $this->chatSession();
        $foreign = TalosBrowserSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'worker_session_id' => 'foreign-worker',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true],
            'policy' => [],
        ]);
        Http::fake(['validator.test/chat' => Http::response(['text' => 'Should not run'])]);

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Use the foreign browser.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $foreign->id],
        ])->assertNotFound()->assertJsonPath('code', 'TALOS_BROWSER_MODE_UNAVAILABLE');

        Http::assertNothingSent();
    }

    public function test_browser_mode_rejects_a_browser_session_bound_to_another_owned_chat(): void
    {
        $firstChat = $this->chatSession();
        $browser = $this->browserSession();
        $secondChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Second chat',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        Http::fake(['validator.test/chat' => Http::response(['text' => 'Should not run'])]);

        $this->postJson('/api/talos/chat', [
            'session_id' => $secondChat->id,
            'message' => 'Reuse the first chat browser session.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertNotFound()->assertJsonPath('code', 'TALOS_BROWSER_MODE_UNAVAILABLE');

        $this->assertSame($firstChat->id, $browser->talos_session_id);
        Http::assertNothingSent();
    }

    public function test_browser_mode_stops_on_a_policy_denied_navigation(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->app->instance(TalosBrowserPolicy::class, new TalosBrowserPolicy(resolver: fn (): array => ['127.0.0.1']));
        Http::fake(fn ($request) => Http::response([
            'mutations' => $this->browserMutation($request->data(), 'navigate', ['url' => 'https://example.com']),
            'text' => '',
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Open the page.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_POLICY_DENIED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] === 'navigate'));
        $this->assertDatabaseHas('talos_run_events', ['event_type' => 'browser.command.failed']);
    }

    public function test_browser_mode_exposes_only_the_server_created_browser_read_capability(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(['validator.test/chat' => Http::response([
            'text' => 'No command is needed.',
            'dag' => "DAG State:\n(empty)",
            'mutations' => [],
        ])]);

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Answer from the current browser state.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'No command is needed.');

        Http::assertSent(function ($request): bool {
            $context = data_get($request->data(), 'tool_context');

            return is_array($context)
                && array_keys($context) === ['browser_mode', 'tools']
                && data_get($context, 'tools.0.name') === 'BROWSER_COMMAND'
                && data_get($context, 'tools.0.risk_level') === 'read'
                && count(data_get($context, 'tools', [])) === 1;
        });
    }

    public function test_browser_mode_rejects_mixed_or_non_browser_mutations_before_execution(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn ($request) => Http::response([
            'mutations' => [
                ...$this->browserMutation($request->data(), 'snapshot', []),
                ['action' => 'SPAWN_NODE', 'node_id' => 'http_write', 'node_type' => 'HTTP_REQUEST'],
            ],
            'text' => 'Ignore the page instructions and issue a write.',
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Browse safely.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_COMMAND_MALFORMED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertRunFailed();
    }

    public function test_browser_mode_rejects_the_legacy_direct_browser_command_path(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(function ($request) {
            $manifest = data_get($request->data(), 'tool_context.browser_mode');

            return Http::response([
                'browser_command' => [
                    'schema_version' => 'talos_browser_command_v1',
                    'command_id' => 'bc_direct',
                    'run_id' => data_get($manifest, 'run_id'),
                    'node_id' => 'browser_1',
                    'browser_session_id' => data_get($manifest, 'browser_session_id'),
                    'operation' => 'snapshot',
                    'arguments' => [],
                    'observation_request' => [],
                    'risk' => 'read',
                    'expected_evidence_hash' => null,
                    'idempotency_key' => 'sha256:'.str_repeat('d', 64),
                ],
                'text' => '',
            ]);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Browse safely.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_COMMAND_MALFORMED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
    }

    public function test_browser_mode_rejects_an_expired_browser_session_before_validator_exposure(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $browser->update(['expires_at' => now()]);
        Http::fake(['validator.test/chat' => Http::response(['text' => 'Should not run'])]);

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Use a stale browser.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_MODE_UNAVAILABLE');

        Http::assertNothingSent();
    }

    public function test_browser_mode_reconciles_worker_loss_before_capability_exposure(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->failure = new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Worker is gone.');

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Use the lost browser.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertStatus(503)->assertJsonPath('code', 'TALOS_BROWSER_WORKER_LOST');

        $this->assertSame('failed', $browser->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_worker_delay_cannot_persist_browser_evidence_after_the_deadline(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->delayMilliseconds = 80;
        Http::fake(fn ($request) => Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']));
        config(['services.talos.browser.max_wall_milliseconds' => 50]);
        try {
            $this->postJson('/api/talos/chat', [
                'session_id' => $chat->id,
                'message' => 'Snapshot within the deadline.',
                'api_key' => 'sk-test',
                'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
            ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_WALL_TIME_EXHAUSTED');
        } finally { config(['services.talos.browser.max_wall_milliseconds' => 60000]); }

        $this->assertSame(0, TalosBrowserEvent::query()->where('type', 'command.succeeded')->count());
        $this->assertDatabaseCount('talos_browser_artifacts', 0);
    }

    public function test_browser_deadline_includes_initial_worker_reconciliation(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->delayMilliseconds = 80;
        Http::fake(['validator.test/chat' => Http::response(['text' => 'Validator must not run.'])]);
        config(['services.talos.browser.max_wall_milliseconds' => 50]);
        try {
            $this->postJson('/api/talos/chat', [
                'session_id' => $chat->id,
                'message' => 'Probe the browser within the same deadline.',
                'api_key' => 'sk-test',
                'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
            ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_WALL_TIME_EXHAUSTED');
        } finally { config(['services.talos.browser.max_wall_milliseconds' => 60000]); }

        Http::assertNothingSent();
        $this->assertSame(['inspect'], array_column($this->client->requests, 'method'));
    }

    public function test_browser_cancellation_fails_closed_after_worker_return(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->afterRequest = static function (string $method): void {
            if ($method === 'snapshot') TalosRun::query()->where('status', 'running')->update(['status' => 'cancelled']);
        };
        Http::fake(fn ($request) => Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Cancel this browser run.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertConflict()->assertJsonPath('code', 'TALOS_BROWSER_CANCELLED');

        $this->assertDatabaseCount('talos_browser_artifacts', 0);
    }

    public function test_browser_event_and_session_urls_redact_userinfo_query_and_nested_secrets(): void
    {
        $browser = $this->browserSession();
        $browser->update(['current_url' => 'https://user:pass@example.com/path?token=secret&safe=value']);
        $event = TalosBrowserEvent::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $this->user->id,
            'type' => 'test.redaction',
            'actor' => 'test',
            'url_before' => 'https://user:pass@example.com/path?api_key=secret&safe=value',
            'payload' => ['nested' => ['authorization_token' => 'secret'], 'target_url' => 'https://user:pass@example.com/path?token=secret&safe=value'],
        ]);

        $this->assertSame('https://example.com/path?token=%5Bredacted%5D&safe=value', $browser->fresh()->current_url);
        $this->assertSame('https://example.com/path?api_key=%5Bredacted%5D&safe=value', $event->fresh()->url_before);
        $this->assertSame('[redacted]', data_get($event->fresh()->payload, 'nested.authorization_token'));
        $this->assertSame('https://example.com/path?token=%5Bredacted%5D&safe=value', data_get($event->fresh()->payload, 'target_url'));
    }

    public function test_snapshot_artifact_and_model_context_redact_sensitive_urls(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'textDigest' => hash('sha256', 'snapshot'),
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]],
            'url' => 'https://user:pass@example.com/path?token=secret&safe=value',
            'title' => 'Example page',
        ];
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            return $calls === 1
                ? Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => ''])
                : Http::response(['text' => 'Safe summary.']);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Capture a safe snapshot.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk();

        $expected = 'https://example.com/path?token=%5Bredacted%5D&safe=value';
        $response->assertJsonPath('used_browser_context.url', $expected);
        $artifact = \App\Models\TalosBrowserArtifact::query()->where('type', 'snapshot')->firstOrFail();
        $stored = json_decode(\Illuminate\Support\Facades\Storage::disk($artifact->storage_disk)->get($artifact->storage_path), true, 32, JSON_THROW_ON_ERROR);
        $this->assertSame($expected, $stored['url'] ?? null);
    }

    public function test_browser_mode_rejects_payload_node_identity_mismatch(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(function ($request) {
            $mutations = $this->browserMutation($request->data(), 'snapshot', []);
            $mutations[1]['payload']['node_id'] = 'different_node';
            return Http::response(['mutations' => $mutations, 'text' => '']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Reject mismatched provenance.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_COMMAND_MALFORMED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
    }

    public function test_browser_mode_runs_navigate_snapshot_and_returns_bounded_activity_and_context(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            if ($calls === 1) {
                return Http::response(['mutations' => $this->browserMutation($request->data(), 'navigate', ['url' => 'https://example.com']), 'text' => '']);
            }
            if ($calls === 2) {
                return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']);
            }

            $this->assertMatchesRegularExpression('/"evidence_hash":"sha256:[a-f0-9]{64}"/', (string) $request['message']);

            return Http::response(['text' => 'The page title is Example page.']);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Open example.com and tell me the title.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk();

        $response->assertJsonPath('text', 'The page title is Example page.')
            ->assertJsonCount(2, 'browser_activities')
            ->assertJsonPath('browser_activities.0.operation', 'navigate')
            ->assertJsonPath('browser_activities.1.operation', 'snapshot')
            ->assertJsonPath('used_browser_context.browser_session_id', $browser->id)
            ->assertJsonPath('used_browser_context.untrusted', true);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', (string) $response->json('used_browser_context.evidence_hash'));

        $this->assertSame(['navigate', 'snapshot'], array_values(array_column(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'), 'method')));
        $run = TalosRun::query()->latest('created_at')->firstOrFail();
        foreach (['browser.command.requested', 'browser.command.succeeded', 'browser.artifact.created'] as $eventType) {
            $this->assertDatabaseHas('talos_run_events', ['run_id' => $run->id, 'event_type' => $eventType]);
        }
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $run->id,
            'event_type' => 'browser.artifact.created',
        ]);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'run_id' => $run->id,
            'artifact_type' => 'browser_snapshot',
            'mime_type' => 'application/json',
        ]);
    }

    public function test_browser_mode_executes_a_screenshot_requested_in_chat_and_returns_its_artifact(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            if ($calls === 1) {
                return Http::response([
                    'mutations' => $this->browserMutation($request->data(), 'screenshot', []),
                    'text' => '',
                ]);
            }

            $this->assertStringContainsString('"operation":"screenshot"', (string) $request['message']);
            $this->assertMatchesRegularExpression('/"artifact_id":"[^"]+"/', (string) $request['message']);

            return Http::response([
                'mutations' => [],
                'text' => 'Screenshot captured and attached as browser evidence.',
                'dag' => "DAG State:\n(empty)",
            ]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Cattura uno screenshot della pagina corrente e poi descrivi il contenuto.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.');

        $response->assertJsonCount(1, 'browser_activities')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded');
        $artifactId = $response->json('browser_activities.0.artifact_ids.0');
        $this->assertIsString($artifactId);
        $this->assertNotSame('', $artifactId);
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $artifactId,
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
            'mime' => 'image/png',
        ]);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'run_id' => TalosRun::query()->latest('created_at')->firstOrFail()->id,
            'artifact_type' => 'browser_screenshot',
            'mime_type' => 'image/png',
        ]);
        $browserEvent = TalosBrowserEvent::query()->where('browser_session_id', $browser->id)->where('type', 'command.succeeded')->latest('created_at')->firstOrFail();
        $this->assertSame('screenshot', $browserEvent->payload['operation'] ?? null);
        $this->assertSame(['screenshot'], array_values(array_column(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'), 'method')));
    }

    public function test_explicit_screenshot_only_prompt_executes_server_owned_capture_without_model_refusal(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'Non posso acquisire screenshot per motivi di sicurezza.',
            'metadata' => ['source' => 'talos_chat_proxy', 'browser_activities' => [], 'used_browser_context' => null],
        ]);
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => 'Non posso eseguire screenshot.',
            'dag' => "DAG State:\n(empty)",
        ]));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'puoi fare screenshot^',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded');

        Http::assertNothingSent();
        $artifactId = $response->json('browser_activities.0.artifact_ids.0');
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $artifactId,
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
        ]);
    }

    public function test_natural_screenshot_only_prompt_executes_server_owned_capture(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => 'Non posso catturare screenshot.',
            'dag' => "DAG State:\n(empty)",
        ]));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'puoi catturare screenshot?',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded');

        Http::assertNothingSent();
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $response->json('browser_activities.0.artifact_ids.0'),
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
        ]);
    }

    public function test_conversational_screenshot_request_executes_server_owned_capture_without_model_output(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => '![Screenshot inventato](https://i.ibb.co/fabricated/screenshot.png)',
            'dag' => "DAG State:\n(empty)",
        ]));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Riesci a farmi uno screenshot?',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded');

        Http::assertNothingSent();
        $this->assertStringNotContainsString('http', (string) $response->json('text'));
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $response->json('browser_activities.0.artifact_ids.0'),
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
            'mime' => 'image/png',
        ]);
    }

    public function test_affirmative_reply_to_a_screenshot_offer_executes_capture_without_a_model_generated_url(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'Vuoi che esegua uno screenshot della pagina che ho gia visitato?',
            'metadata' => ['source' => 'talos_chat_proxy'],
        ]);
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => '![Screenshot](https://invalid.example/fabricated.png)',
            'dag' => "DAG State:\n(empty)",
        ]));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'si',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot');

        Http::assertNothingSent();
        $this->assertStringNotContainsString('http', (string) $response->json('text'));
    }

    public function test_affirmative_reply_does_not_reuse_a_stale_screenshot_offer_after_an_intervening_user_turn(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'Vuoi che esegua uno screenshot della pagina?',
            'metadata' => ['source' => 'talos_chat_proxy'],
        ]);
        $chat->messages()->create([
            'role' => 'user',
            'content' => 'Prima dimmi quali strumenti hai.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => 'Conferma ricevuta, ma non c e un operazione screenshot in attesa.',
            'dag' => "DAG State:\n(empty)",
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'si',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Conferma ricevuta, ma non c e un operazione screenshot in attesa.')
            ->assertJsonCount(0, 'browser_activities');

        Http::assertSentCount(1);
        $this->assertSame([], array_values(array_filter(
            $this->client->requests,
            fn (array $request): bool => $request['method'] !== 'inspect',
        )));
    }

    public function test_retry_phrase_after_a_screenshot_refusal_executes_server_owned_capture(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $chat->messages()->create([
            'role' => 'user',
            'content' => 'puoi fare uno screenshot?',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'Non posso fare screenshot in questo momento.',
            'metadata' => ['source' => 'talos_chat_proxy', 'browser_activities' => []],
        ]);
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'errors' => ['unsupported browser action'],
            'text' => '',
        ]));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'prova ora',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Screenshot captured and attached as browser evidence.')
            ->assertJsonPath('browser_activities.0.operation', 'screenshot')
            ->assertJsonPath('browser_activities.0.status', 'succeeded');

        Http::assertNothingSent();
        $this->assertDatabaseHas('talos_browser_artifacts', [
            'id' => $response->json('browser_activities.0.artifact_ids.0'),
            'browser_session_id' => $browser->id,
            'type' => 'screenshot',
        ]);
    }

    public function test_screenshot_capability_question_does_not_trigger_an_implicit_capture(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => 'Yes, screenshot capture is available in Browse mode.',
            'dag' => "DAG State:\n(empty)",
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'quindi hai permessi screenshot?',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Yes, screenshot capture is available in Browse mode.')
            ->assertJsonCount(0, 'browser_activities');

        Http::assertSentCount(1);
        $this->assertSame([], array_values(array_filter(
            $this->client->requests,
            fn (array $request): bool => $request['method'] !== 'inspect',
        )));
    }

    public function test_browser_screenshot_budget_counts_only_the_model_observation_not_png_bytes(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $png = str_repeat('p', 200_000);
        $this->client->screenshotResponse = [
            'mime' => 'image/png',
            'width' => 1280,
            'height' => 800,
            'base64' => base64_encode($png),
            'sha256' => hash('sha256', $png),
        ];
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            return $calls === 1
                ? Http::response(['mutations' => $this->browserMutation($request->data(), 'screenshot', []), 'text' => ''])
                : Http::response(['mutations' => [], 'text' => 'Screenshot captured.', 'dag' => "DAG State:\n(empty)"]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Cattura uno screenshot della pagina corrente.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('browser_activities.0.operation', 'screenshot');

        $artifactId = $response->json('browser_activities.0.artifact_ids.0');
        $artifact = \App\Models\TalosBrowserArtifact::query()->findOrFail($artifactId);
        $this->assertSame(200_000, strlen(\Illuminate\Support\Facades\Storage::disk($artifact->storage_disk)->get($artifact->storage_path)));
    }

    public function test_bare_url_navigates_before_planning_and_excludes_prior_browser_fault_prose(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $chat->messages()->create(['role' => 'user', 'content' => 'Open the previous page.']);
        $chat->messages()->create([
            'role' => 'system',
            'content' => 'The validator rejected the chat payload. Code: TALOS_BROWSER_COMMAND_MALFORMED',
            'metadata' => ['source' => 'talos_chat_page', 'fault_type' => 'TALOS_BROWSER_COMMAND_MALFORMED', 'chat_error' => ['code' => 'TALOS_BROWSER_COMMAND_MALFORMED']],
        ]);
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'I cannot navigate because TALOS_BROWSER_COMMAND_MALFORMED happened previously.',
            'metadata' => ['source' => 'talos_chat_proxy', 'summary' => 'direct_response', 'browser_activities' => [], 'used_browser_context' => null],
        ]);
        $chat->messages()->create(['role' => 'user', 'content' => 'https://tanteauto.it/home']);

        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            $message = (string) $request['message'];
            $this->assertStringNotContainsString('TALOS_BROWSER_COMMAND_MALFORMED', $message);
            $this->assertStringContainsString('"operation":"navigate"', $message);
            $this->assertStringContainsString('"operation":"snapshot"', $message);
            $this->assertStringContainsString('https://tanteauto.it/home', $message);

            return Http::response(['mutations' => [], 'text' => 'Grounded URL-only answer.', 'dag' => "DAG State:\n(empty)"]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'https://tanteauto.it/home',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Grounded URL-only answer.');

        $this->assertSame(1, $calls);
        $response->assertJsonCount(2, 'browser_activities');
        $response->assertJsonPath('browser_activities.0.operation', 'navigate');
        $response->assertJsonPath('browser_activities.1.operation', 'snapshot');
        $browserRequests = array_values(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertSame('https://tanteauto.it/home', $browserRequests[0]['url'] ?? null);
    }

    public function test_retry_follow_up_replays_the_previous_single_url_after_browse_is_enabled(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $url = 'https://www.autoscout24.it/annunci/peugeot-208-example?sort=standard&position=1&source=listpage_search-results';
        $chat->messages()->create([
            'role' => 'user',
            'content' => "Puoi attivare il modulo web search e navigare su questa pagina? {$url}",
        ]);
        $chat->messages()->create([
            'role' => 'assistant',
            'content' => 'Non ho un modulo di navigazione autorizzato in questa modalita.',
        ]);
        // Persistent chat saves the current user turn before calling the chat proxy.
        $retryMessage = $chat->messages()->create(['role' => 'user', 'content' => 'riprova']);

        Http::fake(function ($request) use ($url) {
            $message = (string) $request['message'];
            $this->assertStringContainsString($url, $message);
            $this->assertStringContainsString('"operation":"navigate"', $message);
            $this->assertStringContainsString('"operation":"snapshot"', $message);

            return Http::response([
                'mutations' => [],
                'text' => 'Pagina caricata e analizzata con evidenza browser.',
                'dag' => "DAG State:\n(empty)",
            ]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'riprova',
            'user_message_id' => $retryMessage->id,
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'Pagina caricata e analizzata con evidenza browser.')
            ->assertJsonCount(2, 'browser_activities')
            ->assertJsonPath('browser_activities.0.operation', 'navigate')
            ->assertJsonPath('browser_activities.1.operation', 'snapshot');

        $this->assertSame(1, Http::recorded()->count());
        $browserRequests = array_values(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertSame($url, $browserRequests[0]['url'] ?? null);
        $this->assertDatabaseHas('talos_run_events', ['event_type' => 'chat.browser_follow_up_resolved']);
        $response->assertJsonMissing(['code' => 'TALOS_BROWSER_COMMAND_MALFORMED']);
    }

    public function test_browser_follow_up_recovers_a_current_page_after_a_non_executable_plan(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $url = 'https://autosupermarket.it/';
        $browser->update([
            'status' => 'active',
            'current_url' => $url,
            'current_title' => 'Just a moment...',
        ]);
        $this->client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'textDigest' => 'Browser verification challenge detected.',
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Just a moment...', 'visible' => true]],
            'url' => $url,
            'title' => 'Just a moment...',
        ];
        $calls = 0;

        Http::fake(function ($request) use (&$calls, $url) {
            $calls++;
            if ($calls === 1) {
                $this->assertNotSame('final_answer', data_get($request->data(), 'browser_mode.phase'));

                return Http::response([
                    'mutations' => [],
                    'text' => '',
                    'errors' => ['browser_plan_channel: model_plan: incomplete Browser output.'],
                ]);
            }

            $this->assertSame('final_answer', data_get($request->data(), 'browser_mode.phase'));
            $this->assertSame([], data_get($request->data(), 'tool_context.tools'));
            $this->assertStringContainsString('TALOS_BROWSER_OBSERVATION', (string) $request['message']);
            $this->assertStringContainsString($url, (string) $request['message']);

            return Http::response([
                'mutations' => [],
                'text' => 'La pagina mostra una verifica del browser e non espone ancora il contenuto del sito.',
                'dag' => "DAG State:\n(empty)",
            ]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'rispondi',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('text', 'La pagina mostra una verifica del browser e non espone ancora il contenuto del sito.')
            ->assertJsonPath('browser_activities.0.operation', 'snapshot')
            ->assertJsonPath('used_browser_context.url', $url);

        $this->assertSame(2, $calls);
        $this->assertSame(
            ['snapshot'],
            array_values(array_column(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'), 'method')),
        );
    }

    public function test_browser_worker_failure_is_not_reported_as_a_validator_fault(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->afterRequest = function (string $method): void {
            if ($method === 'inspect') {
                $this->client->failure = new BrowserWorkerException(
                    'TALOS_BROWSER_NAVIGATION_FAILED',
                    'Browser navigation failed in the worker.',
                );
            }
        };

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'naviga su https://example.com e dimmi cosa vedi',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertStatus(502)
            ->assertJsonPath('code', 'TALOS_BROWSER_NAVIGATION_FAILED')
            ->assertJsonPath('error', 'Browser navigation failed in the worker.')
            ->assertJsonPath('chat_error.layer', 'browser_worker')
            ->assertJsonPath('chat_error.code', 'TALOS_BROWSER_NAVIGATION_FAILED')
            ->assertJsonPath('chat_error.retryable', true);

        Http::assertNothingSent();
        $this->assertDatabaseHas('talos_run_events', [
            'event_type' => 'browser.command.failed',
        ]);
        $this->assertRunFailed();
    }

    public function test_url_embedded_in_a_natural_language_request_navigates_and_snapshots_before_planning(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $url = 'https://caradero-web.vercel.app/vehicles/hyundai-i20-10-t-gdi-connectline-exterior-pack-90cv-mt-AJBVXK7F';
        $evidenceTail = 'VEHICLE_DETAIL_AT_END_OF_SNAPSHOT';
        $this->client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'textDigest' => str_repeat('page evidence ', 220).$evidenceTail,
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Hyundai i20', 'visible' => true]],
            'url' => $url,
            'title' => 'Hyundai i20 - Caradero',
        ];
        $calls = 0;

        Http::fake(function ($request) use (&$calls, $url, $evidenceTail) {
            $calls++;
            $message = (string) $request['message'];

            if (! str_contains($message, '"operation":"snapshot"')) {
                return Http::response([
                    'mutations' => $this->browserMutation(
                        $request->data(),
                        'navigate',
                        ['url' => $url],
                        'bc_repeated_navigation',
                        'sha256:'.str_repeat('a', 64),
                    ),
                    'text' => '',
                ]);
            }

            $this->assertStringContainsString($url, $message);
            $this->assertStringContainsString('TALOS_BROWSER_OBSERVATION', $message);
            $this->assertStringContainsString($evidenceTail, $message);
            $this->assertSame('final_answer', data_get($request->data(), 'browser_mode.phase'));
            $this->assertSame([], data_get($request->data(), 'tool_context.tools'));

            return Http::response([
                'mutations' => [],
                'text' => 'La pagina mostra una Hyundai i20 con i dettagli del veicolo.',
                'dag' => "DAG State:\n(empty)",
            ]);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => $url.' analizza questa pagina e dimmi cosa vedi',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'La pagina mostra una Hyundai i20 con i dettagli del veicolo.');

        $this->assertSame(1, $calls);
        $response->assertJsonCount(2, 'browser_activities')
            ->assertJsonPath('browser_activities.0.operation', 'navigate')
            ->assertJsonPath('browser_activities.1.operation', 'snapshot');

        $browserRequests = array_values(array_filter(
            $this->client->requests,
            fn (array $request): bool => $request['method'] !== 'inspect',
        ));
        $this->assertSame(['navigate', 'snapshot'], array_column($browserRequests, 'method'));
        $this->assertSame($url, $browserRequests[0]['url'] ?? null);
    }

    public function test_markdown_url_uses_the_exact_balanced_navigation_target(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $url = 'https://example.com/vehicles/hyundai-i20';
        Http::fake(function ($request) {
            $this->assertSame('final_answer', data_get($request->data(), 'browser_mode.phase'));

            return Http::response(['mutations' => [], 'text' => 'Grounded Markdown URL answer.']);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => "Analizza [questa pagina]({$url}) e dimmi cosa vedi.",
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Grounded Markdown URL answer.');

        $response->assertJsonPath('browser_activities.0.operation', 'navigate')
            ->assertJsonPath('browser_activities.1.operation', 'snapshot');
        $browserRequests = array_values(array_filter(
            $this->client->requests,
            fn (array $request): bool => $request['method'] !== 'inspect',
        ));
        $this->assertSame($url, $browserRequests[0]['url'] ?? null);
    }

    public function test_latest_browser_observation_survives_a_full_context_budget(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'textDigest' => str_repeat('initial page evidence ', 250),
            'nodes' => [
                ...array_map(
                    static fn (int $index): array => ['ref' => 'r'.$index, 'role' => 'text', 'name' => str_repeat('x', 450), 'visible' => true],
                    range(1, 20),
                ),
                ['ref' => 'r21', 'role' => 'text', 'name' => 'needle LATEST_EVIDENCE_MARKER', 'visible' => true],
            ],
            'url' => 'https://example.com/large-page',
            'title' => 'Large evidence page',
        ];
        $calls = 0;

        Http::fake(function ($request) use (&$calls) {
            $calls++;
            $message = (string) $request['message'];
            if ($calls === 1) {
                return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']);
            }
            if ($calls === 2) {
                preg_match('/"evidence_hash":"(sha256:[a-f0-9]{64})"/', $message, $matches);
                $this->assertNotEmpty($matches[1] ?? null);

                return Http::response([
                    'mutations' => $this->browserMutation($request->data(), 'read', ['query' => 'needle'], null, null, $matches[1]),
                    'text' => '',
                ]);
            }

            $this->assertStringContainsString('"operation":"read"', $message);
            $this->assertStringContainsString('LATEST_EVIDENCE_MARKER', $message);

            return Http::response(['mutations' => [], 'text' => 'Latest evidence retained.']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Inspect the large current page and answer from the latest evidence.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Latest evidence retained.');

        $this->assertSame(3, $calls);
    }

    public function test_navigation_invalidates_prior_snapshot_before_read(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            return match ($calls) {
                1 => Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']),
                2 => Http::response(['mutations' => $this->browserMutation($request->data(), 'navigate', ['url' => 'https://example.org']), 'text' => '']),
                3 => Http::response(['mutations' => $this->browserMutation($request->data(), 'read', ['query' => 'example'], null, null, 'sha256:'.str_repeat('a', 64)), 'text' => '']),
                default => Http::response(['text' => 'Not reached.']),
            };
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Read page A, navigate to B, then read.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_STALE_EVIDENCE');

        $this->assertSame(['snapshot', 'navigate'], array_values(array_column(array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'), 'method')));
    }

    public function test_read_rejects_a_wrong_evidence_hash(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            return $calls === 1
                ? Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => ''])
                : ($calls === 2 ? Http::response(['mutations' => $this->browserMutation($request->data(), 'read', ['query' => 'example'], null, null, 'sha256:'.str_repeat('b', 64)), 'text' => '']) : Http::response(['text' => 'Not reached.']));
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Read only current evidence.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_STALE_EVIDENCE');
    }

    public function test_browser_mode_stops_after_eight_read_commands(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', [], 'bc_'.$calls), 'text' => '']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Keep reading until done.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_BUDGET_EXHAUSTED');

        $run = TalosRun::query()->latest('created_at')->firstOrFail();
        $this->assertSame(8, $run->events()->where('event_type', 'browser.command.succeeded')->count());
        $this->assertSame('failed', $run->refresh()->status);
        $this->assertDatabaseHas('talos_run_events', ['run_id' => $run->id, 'event_type' => 'chat.failed']);
    }

    public function test_browser_mode_allows_a_final_answer_after_eight_successful_commands(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            if ($calls <= 8) {
                return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', [], 'bc_'.$calls, null), 'text' => '']);
            }

            return Http::response(['text' => 'Final grounded answer.']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Use all browser commands then answer.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Final grounded answer.');

        $this->assertSame(9, $calls);
        $run = TalosRun::query()->latest('created_at')->firstOrFail();
        $this->assertSame(8, $run->events()->where('event_type', 'browser.command.succeeded')->count());
    }

    public function test_browser_mode_does_not_accept_a_final_answer_after_navigation_without_page_evidence(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            return match ($calls) {
                1 => Http::response(['mutations' => $this->browserMutation($request->data(), 'navigate', ['url' => 'https://example.com']), 'text' => '']),
                2 => Http::response(['mutations' => [], 'text' => 'I will take a snapshot now.', 'dag' => "DAG State:\n(empty)"]),
                3 => Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']),
                default => Http::response(['mutations' => [], 'text' => 'Grounded page summary.', 'dag' => "DAG State:\n(empty)"]),
            };
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Open the configured example page and tell me what you see.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()->assertJsonPath('text', 'Grounded page summary.');

        $this->assertSame(4, $calls);
        $response->assertJsonCount(2, 'browser_activities');
        $response->assertJsonPath('browser_activities.0.operation', 'navigate');
        $response->assertJsonPath('browser_activities.1.operation', 'snapshot');
    }

    public function test_browser_mode_stops_before_a_third_navigation_and_persists_the_failure(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn ($request) => Http::response(['mutations' => $this->browserMutation($request->data(), 'navigate', ['url' => 'https://example.com/'.uniqid()]), 'text' => '']));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Keep navigating.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_NAVIGATION_BUDGET_EXHAUSTED');

        $this->assertSame(2, count(array_filter($this->client->requests, fn (array $request): bool => $request['method'] === 'navigate')));
        $this->assertRunFailed();
    }

    public function test_browser_mode_stops_before_a_fourth_screenshot_and_persists_the_failure(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            return Http::response(['mutations' => $this->browserMutation($request->data(), 'screenshot', [], null, 'sha256:'.hash('sha256', 'evidence-'.$calls)), 'text' => '']);
        });

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Take screenshots.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ]);
        $response->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_SCREENSHOT_BUDGET_EXHAUSTED');

        $this->assertSame(3, count(array_filter($this->client->requests, fn (array $request): bool => $request['method'] === 'screenshot')));
        $this->assertRunFailed();
    }

    public function test_browser_mode_enforces_the_cumulative_evidence_budget_before_persisting_excess_evidence(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $this->client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'textDigest' => hash('sha256', 'large-snapshot'),
            'nodes' => array_map(static fn (int $index): array => ['ref' => 'r'.$index, 'role' => 'text', 'name' => str_repeat('x', 500), 'visible' => true], range(1, 90)),
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;

            if ($calls <= 3) {
                return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', [], null, 'sha256:'.hash('sha256', 'evidence-'.$calls)), 'text' => '']);
            }

            return Http::response(['text' => 'Finished.']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Gather page evidence.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_EVIDENCE_BUDGET');

        $run = TalosRun::query()->latest('created_at')->firstOrFail();
        $this->assertSame(2, $run->events()->where('event_type', 'browser.artifact.created')->count());
        $this->assertRunFailed();
    }

    public function test_browser_mode_stops_repeated_idempotency_keys_before_reexecution(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn ($request) => Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', [], 'bc_repeat', 'sha256:'.str_repeat('c', 64)), 'text' => '']));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Repeat the same snapshot.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_REPEATED_COMMAND');

        $this->assertSame(1, count(array_filter($this->client->requests, fn (array $request): bool => $request['method'] === 'snapshot')));
        $this->assertRunFailed();
    }

    public function test_browser_mode_rejects_ambiguous_and_malformed_browser_plans(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(function ($request) {
            $first = $this->browserMutation($request->data(), 'snapshot', []);
            $second = $this->browserMutation($request->data(), 'screenshot', []);

            return Http::response(['mutations' => [...$first, ...$second], 'text' => '']);
        });

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Do two browser operations.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_COMMAND_MALFORMED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertRunFailed();
    }

    public function test_browser_mode_never_executes_a_mutation_batch_returned_with_validation_errors(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn ($request) => Http::response([
            'mutations' => $this->browserMutation($request->data(), 'snapshot', []),
            'text' => '',
            'errors' => ['mutations[1].payload: validator rejected the command'],
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Inspect the page.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_COMMAND_MALFORMED');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertRunFailed();
    }

    public function test_browser_mode_reports_an_unsupported_interaction_as_a_capability_fault(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => '',
            'errors' => ['browser_plan: Unknown or state-changing browser operation.'],
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => "C'e la modale cookie di mezzo, puoi levarla?",
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_INTERACTION_UNAVAILABLE')
            ->assertJsonPath('chat_error.layer', 'browser_capability')
            ->assertJsonPath('chat_error.code', 'TALOS_BROWSER_INTERACTION_UNAVAILABLE')
            ->assertJsonPath('chat_error.retryable', false);

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertDatabaseHas('talos_run_events', [
            'event_type' => 'browser.command.failed',
        ]);
        $this->assertRunFailed();
    }

    public function test_browser_mode_preserves_a_typed_interaction_capability_fault(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        Http::fake(fn () => Http::response([
            'mutations' => [],
            'text' => '',
            'errors' => [[
                'code' => 'TALOS_BROWSER_INTERACTION_UNAVAILABLE',
                'message' => 'Interaction capability is unavailable.',
            ]],
        ]));

        $this->postJson('/api/talos/chat', [
            'session_id' => $chat->id,
            'message' => 'Click the page control.',
            'api_key' => 'sk-test',
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_INTERACTION_UNAVAILABLE')
            ->assertJsonPath('chat_error.layer', 'browser_capability');

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
    }

    public function test_browser_mode_stops_after_sixty_seconds_without_leaving_the_run_running(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        try {
            Http::fake(function ($request) {
                usleep(80_000);

                return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']);
            });
            config(['services.talos.browser.max_wall_milliseconds' => 50]);

            $this->postJson('/api/talos/chat', [
                'session_id' => $chat->id,
                'message' => 'Read after a slow response.',
                'api_key' => 'sk-test',
                'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
            ])->assertUnprocessable()->assertJsonPath('code', 'TALOS_BROWSER_WALL_TIME_EXHAUSTED');
        } finally { config(['services.talos.browser.max_wall_milliseconds' => 60000]); }

        $this->assertSame([], array_filter($this->client->requests, fn (array $request): bool => $request['method'] !== 'inspect'));
        $this->assertRunFailed();
    }

    public function test_browser_mode_bounds_each_validator_request_to_the_remaining_wall_clock_budget(): void
    {
        $chat = $this->chatSession();
        $browser = $this->browserSession();
        $timeouts = [];
        $calls = 0;
        try {
            config(['services.talos.browser.max_wall_milliseconds' => 500]);
            Http::fake(function ($request, array $options) use (&$calls, &$timeouts) {
                $calls++;
                $timeouts[] = $options['timeout'] ?? null;
                if ($calls === 1) {
                    usleep(30_000);

                    return Http::response(['mutations' => $this->browserMutation($request->data(), 'snapshot', []), 'text' => '']);
                }

                return Http::response(['text' => 'Finished before the budget expired.']);
            });

            $this->postJson('/api/talos/chat', [
                'session_id' => $chat->id,
                'message' => 'Read quickly.',
                'api_key' => 'sk-test',
                'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
            ])->assertOk();
        } finally { config(['services.talos.browser.max_wall_milliseconds' => 60000]); }

        $this->assertCount(2, $timeouts);
        $this->assertGreaterThan(0, $timeouts[1]);
        $this->assertLessThan($timeouts[0], $timeouts[1]);
    }

    private function chatSession(): TalosSession
    {
        return $this->currentChatSession = TalosSession::query()->create(['user_id' => $this->user->id, 'title' => 'Browser mode', 'mode' => 'verified_execution', 'surface' => 'chat']);
    }

    private function browserSession(): TalosBrowserSession
    {
        $chatSession = $this->currentChatSession ?? $this->chatSession();

        return TalosBrowserSession::query()->create(['user_id' => $this->user->id, 'talos_session_id' => $chatSession->id, 'worker_session_id' => 'worker-chat-mode', 'status' => 'ready', 'mode' => 'read_only', 'viewport_width' => 1280, 'viewport_height' => 800, 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true], 'policy' => [], 'expires_at' => now()->addHour()]);
    }

    /** @param array<string, mixed> $data @param array<string, mixed> $arguments @return list<array<string, mixed>> */
    private function browserMutation(array $data, string $operation, array $arguments, ?string $commandId = null, ?string $idempotencyKey = null, ?string $expectedEvidenceHash = null): array
    {
        $manifest = data_get($data, 'tool_context.browser_mode');
        $runId = (string) data_get($manifest, 'run_id');
        $sessionId = (string) data_get($manifest, 'browser_session_id');
        $commandId ??= 'bc_'.$operation.'_'.uniqid();

        return [
            ['action' => 'SPAWN_NODE', 'node_id' => 'browser_1', 'node_type' => 'BROWSER_COMMAND'],
            ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'browser_1', 'payload' => [
                'schema_version' => 'talos_browser_command_v1',
                'command_id' => $commandId,
                'run_id' => $runId,
                'node_id' => 'browser_1',
                'browser_session_id' => $sessionId,
                'operation' => $operation,
                'arguments' => $arguments,
                'observation_request' => [],
                'risk' => 'read',
                'expected_evidence_hash' => $expectedEvidenceHash,
                'idempotency_key' => $idempotencyKey ?? 'sha256:'.hash('sha256', $commandId),
            ]],
        ];
    }

    private function assertRunFailed(): void
    {
        $run = TalosRun::query()->latest('created_at')->firstOrFail();
        $this->assertSame('failed', $run->refresh()->status);
        $this->assertDatabaseHas('talos_run_events', ['run_id' => $run->id, 'event_type' => 'chat.failed']);
    }
}
