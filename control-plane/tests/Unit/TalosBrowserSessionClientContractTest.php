<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserSession;
use App\Providers\AppServiceProvider;
use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\BrowserWorkerConfiguration;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\LegacyBrowserSnapshot;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserWorkerHandshake;
use App\Services\Talos\Browser\TalosBrowserWorkerProtocol;
use Illuminate\Foundation\Vite;
use Illuminate\Routing\UrlGenerator;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class TalosBrowserSessionClientContractTest extends TestCase
{
    private const HMI_INTERACTION_ID = '123e4567-e89b-42d3-a456-426614174000';

    public function test_browser_session_client_declares_the_versioned_hmi_operations(): void
    {
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'handshake'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'preflightPointer'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'executePointer'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'stageFile'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'discardStagedFile'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'cancel'));
        $this->assertSame(BrowserSessionClient::class, (new \ReflectionMethod(BrowserSessionClient::class, 'preflightPointer'))->getDeclaringClass()->getName());
        $this->assertSame(BrowserSessionClient::class, (new \ReflectionMethod(BrowserSessionClient::class, 'executePointer'))->getDeclaringClass()->getName());
    }

    public function test_http_client_negotiates_the_worker_handshake_before_session_creation(): void
    {
        $requests = [];
        Http::fake(function ($request) use (&$requests) {
            $requests[] = ['method' => $request->method(), 'url' => $request->url(), 'body' => $request->data()];
            if ($request->method() === 'GET') {
                return Http::response($this->validHandshake());
            }

            return Http::response(['data' => [
                'sessionId' => 'brw_123e4567-e89b-42d3-a456-426614174001',
                'workerInstanceId' => '123e4567-e89b-42d3-a456-426614174000',
                'status' => 'ready',
                'mode' => 'read_only',
                'protocols' => [
                    'worker' => TalosBrowserWorkerProtocol::WORKER,
                    'hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME,
                ],
                'capabilities' => [
                    'navigation' => true,
                    'screenshots' => true,
                    'accessibilitySnapshot' => true,
                    'actions' => false,
                    'hmiActions' => true,
                    'downloads' => false,
                    'uploads' => false,
                ],
            ]]);
        });
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $session = $client->create('owner-1', 1280, 800);

        $this->assertSame('brw_123e4567-e89b-42d3-a456-426614174001', $session['sessionId']);
        $this->assertSame('GET', $requests[0]['method']);
        $this->assertSame('http://browser-worker.test'.TalosBrowserWorkerProtocol::HANDSHAKE_PATH, $requests[0]['url']);
        $this->assertSame('POST', $requests[1]['method']);
        $this->assertTrue($requests[1]['body']['capabilities']['hmiActions']);
        $this->assertFalse($requests[1]['body']['capabilities']['actions']);
    }

    public function test_worker_handshake_accepts_only_the_v2_dual_authentication_descriptor(): void
    {
        $payload = $this->validHandshake();
        $payload['data']['schema_version'] = 'talos.browser.worker-handshake.v2';
        $payload['data']['protocol_version'] = 'talos.browser.worker.v2';
        $payload['data']['capability_manifest']['protocol_version'] = 'talos.browser.worker.v2';
        $payload['data']['authentication'] = [
            'mode' => 'service_token_and_signed_action_capability',
            'owner_binding' => true,
            'action_capability' => [
                'schema_version' => 'talos.browser.action-capability.v1',
                'algorithm' => 'ES256',
                'type' => 'talos-browser-action+jwt',
                'issuer' => 'urn:talos:control-plane',
                'audience' => 'urn:talos:browser-worker',
                'key_id' => 'browser-action-key-2026-07',
                'max_ttl_seconds' => 30,
            ],
        ];

        $handshake = TalosBrowserWorkerHandshake::fromJson(json_encode($payload, JSON_THROW_ON_ERROR));
        $handshake->assertUsable();

        $this->assertSame($payload['data']['authentication']['action_capability'], $handshake->actionCapability);
        $this->assertSame($payload['data']['authentication'], $handshake->toArray()['authentication']);
    }

    #[DataProvider('unusableHandshakeProvider')]
    public function test_http_client_rejects_incompatible_handshakes_before_session_creation(string $case, string $expectedCode, int $httpStatus): void
    {
        $payload = $this->validHandshake();
        if ($case === 'protocol') {
            $payload['data']['protocol_version'] = 'talos.browser.worker.v1';
        } elseif ($case === 'capability') {
            $payload['data']['capability_manifest']['capabilities'] = ['navigate', 'snapshot', 'screenshot', 'read'];
        } elseif ($case === 'adapter_name') {
            $payload['data']['adapter']['name'] = 'playwright-mcp-drift';
            $payload['data']['capability_manifest']['adapter_name'] = 'playwright-mcp-drift';
        } elseif ($case === 'adapter_version') {
            $payload['data']['adapter']['version'] = '0.0.79';
            $payload['data']['capability_manifest']['adapter_version'] = '0.0.79';
        } else {
            $payload['data']['status'] = 'degraded';
            $payload['data']['degraded_reason'] = 'browser_runtime_unavailable';
            $payload['data']['browser']['version'] = null;
            $payload['data']['capability_manifest']['degraded_reason'] = 'browser_runtime_unavailable';
        }
        Http::fake(['*' => Http::response($payload, $httpStatus)]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        try {
            $client->create('owner-1', 1280, 800);
            $this->fail("The {$case} handshake was accepted.");
        } catch (BrowserWorkerException $exception) {
            $this->assertSame($expectedCode, $exception->errorCode, $case);
        }
        Http::assertSentCount(1);
        Http::assertSent(fn ($request): bool => $request->method() === 'GET');
    }

    /** @return array<string, array{string, string, int}> */
    public static function unusableHandshakeProvider(): array
    {
        return [
            'protocol' => ['protocol', 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH', 200],
            'capability' => ['capability', 'TALOS_BROWSER_WORKER_CAPABILITY_MISMATCH', 200],
            'adapter name' => ['adapter_name', 'TALOS_BROWSER_WORKER_ADAPTER_MISMATCH', 200],
            'adapter version' => ['adapter_version', 'TALOS_BROWSER_WORKER_ADAPTER_MISMATCH', 200],
            'degraded' => ['degraded', 'TALOS_BROWSER_WORKER_DEGRADED', 503],
        ];
    }

    #[DataProvider('handshakeTransportMismatchProvider')]
    public function test_http_client_rejects_handshake_transport_status_disagreement(int $httpStatus, bool $degradedPayload): void
    {
        $payload = $this->validHandshake();
        if ($degradedPayload) {
            $payload['data']['status'] = 'degraded';
            $payload['data']['degraded_reason'] = 'browser_runtime_unavailable';
            $payload['data']['browser']['version'] = null;
            $payload['data']['capability_manifest']['degraded_reason'] = 'browser_runtime_unavailable';
        }
        Http::fake(['*' => Http::response($payload, $httpStatus)]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException(
            'TALOS_BROWSER_WORKER_HANDSHAKE_INVALID',
            'Browser worker returned an invalid handshake.',
        ));
        $client->handshake('owner-1');
    }

    /** @return array<string, array{int, bool}> */
    public static function handshakeTransportMismatchProvider(): array
    {
        return [
            '503 cannot claim ready' => [503, false],
            '200 cannot claim degraded' => [200, true],
        ];
    }

    public function test_http_client_rejects_worker_identity_change_between_handshake_and_session_creation(): void
    {
        Http::fakeSequence()
            ->push($this->validHandshake())
            ->push(['data' => [
                'sessionId' => 'brw_123e4567-e89b-42d3-a456-426614174001',
                'workerInstanceId' => '123e4567-e89b-42d3-a456-426614174999',
                'protocols' => ['worker' => TalosBrowserWorkerProtocol::WORKER, 'hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME],
            ]]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException(
            'TALOS_BROWSER_WORKER_IDENTITY_MISMATCH',
            'Browser worker identity changed during session bootstrap.',
        ));
        $client->create('owner-1', 1280, 800);
    }

    public function test_worker_handshake_rejects_unknown_fields_and_object_list_substitution(): void
    {
        $unknown = $this->validHandshake();
        $unknown['data']['unexpected'] = true;
        $list = $this->validHandshake();
        $list['data']['capability_manifest'] = [];

        foreach ([$unknown, $list] as $payload) {
            try {
                TalosBrowserWorkerHandshake::fromJson(json_encode($payload, JSON_THROW_ON_ERROR));
                $this->fail('A malformed worker handshake was accepted.');
            } catch (BrowserWorkerException $exception) {
                $this->assertSame('TALOS_BROWSER_WORKER_HANDSHAKE_INVALID', $exception->errorCode);
            }
        }
    }

    public function test_browser_tool_result_parses_the_canonical_shape_and_correlates_the_call(): void
    {
        $result = BrowserToolResult::fromJson(json_encode([
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [
                ['type' => 'text', 'text' => 'Done', 'annotations' => new \stdClass, '_meta' => new \stdClass],
                ['type' => 'image', 'data' => base64_encode('png'), 'mimeType' => 'image/png', 'annotations' => new \stdClass, '_meta' => new \stdClass],
                ['type' => 'audio', 'data' => base64_encode('audio'), 'mimeType' => 'audio/wav', 'annotations' => new \stdClass, '_meta' => new \stdClass],
                ['type' => 'resource_link', 'uri' => 'urn:example:resource', 'name' => 'Resource'],
                ['type' => 'resource', 'resource' => ['uri' => 'urn:example:embedded', 'text' => 'Embedded']],
            ],
            'structuredContent' => ['answer' => 'ok'],
            'evidence' => [[
                'artifact_id' => 'artifact-1',
                'kind' => 'snapshot',
                'sha256' => 'sha256:'.str_repeat('a', 64),
                'trusted_boundary' => 'untrusted_worker_output',
            ]],
        ], JSON_THROW_ON_ERROR), 'call-1');

        $this->assertSame('call-1', $result->toolUseId);
        $this->assertFalse($result->isError);
        $this->assertCount(5, $result->content);
        $this->assertSame(['answer' => 'ok'], $result->structuredContent);
        $this->assertSame('sha256:'.str_repeat('a', 64), $result->evidence[0]['sha256']);
    }

    public function test_browser_tool_result_rejects_schema_correlation_and_bounds_fail_closed(): void
    {
        $valid = [
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'ok']],
            'structuredContent' => null,
            'evidence' => [],
        ];

        foreach ([
            ['schema_version' => 'wrong'],
            ['tool_use_id' => 'call-2'],
            ['isError' => 'false'],
            ['content' => array_fill(0, 65, ['type' => 'text', 'text' => 'ok'])],
            ['content' => [['type' => 'text', 'text' => 'ok', 'unknown' => true]]],
            ['evidence' => [[
                'artifact_id' => 'artifact-1',
                'kind' => 'snapshot',
                'sha256' => 'sha256:'.str_repeat('A', 64),
                'trusted_boundary' => 'worker',
            ]]],
        ] as $override) {
            try {
                BrowserToolResult::fromJson(json_encode([...$valid, ...$override], JSON_THROW_ON_ERROR), 'call-1');
                $this->fail('Malformed canonical tool result was accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_browser_tool_result_preserves_wire_object_list_distinctions(): void
    {
        $base = [
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [],
            'structuredContent' => null,
            'evidence' => [],
        ];

        foreach ([
            ['content' => new \stdClass],
            ['evidence' => new \stdClass],
            ['structuredContent' => []],
        ] as $override) {
            try {
                BrowserToolResult::fromJson(json_encode([...$base, ...$override], JSON_THROW_ON_ERROR), 'call-1');
                $this->fail('A wire object/list substitution was accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_browser_tool_result_round_trips_empty_wire_objects_without_turning_them_into_lists(): void
    {
        $result = BrowserToolResult::fromJson(json_encode([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => 'call-wire-shape',
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'ok', '_meta' => new \stdClass]],
            'structuredContent' => ['empty_object' => new \stdClass, 'empty_list' => []],
            'evidence' => [],
        ], JSON_THROW_ON_ERROR), 'call-wire-shape');

        $wire = $result->toWireArray();

        $this->assertInstanceOf(\stdClass::class, $wire['content'][0]['_meta']);
        $this->assertInstanceOf(\stdClass::class, $wire['structuredContent']['empty_object']);
        $this->assertSame([], $wire['structuredContent']['empty_list']);
        $this->assertSame('{', substr(json_encode($result, JSON_THROW_ON_ERROR), 0, 1));
    }

    public function test_http_client_fetches_definitions_and_calls_tools_with_owner_headers_and_deadlines(): void
    {
        $result = $this->validResult('call-1');
        $timeouts = [];
        Http::fake(function ($request, array $options) use (&$timeouts, $result) {
            $timeouts[] = $options;

            return match ($request->method()) {
                'GET' => Http::response(['data' => ['tools' => [['name' => 'browser_snapshot', 'inputSchema' => ['type' => 'object']]]]]),
                'POST' => Http::response($result),
                default => Http::response([], 500),
            };
        });
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token', 15);

        $definitions = $client->toolDefinitions('talos-user:1');
        $actual = $client->callTool('talos-user:1', 'worker-1', 'call-1', 'browser_snapshot', [], 1200);

        $this->assertSame('browser_snapshot', $definitions[0]['name']);
        $this->assertSame('call-1', $actual->toolUseId);
        Http::assertSent(fn ($request): bool => $request->method() === 'GET'
            && $request->url() === 'http://browser-worker.test/tools'
            && $request->hasHeader('X-Talos-Worker-Token', 'worker-token')
            && $request->hasHeader('X-Talos-Owner-Ref', 'talos-user:1'));
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request->url() === 'http://browser-worker.test/sessions/worker-1/tools/call'
            && $request['tool_use_id'] === 'call-1'
            && $request['name'] === 'browser_snapshot'
            && json_decode($request->body(), false, 512, JSON_THROW_ON_ERROR)->arguments instanceof \stdClass
            && $request->hasHeader('X-Talos-Worker-Token', 'worker-token')
            && $request->hasHeader('X-Talos-Owner-Ref', 'talos-user:1')
            && ! $request->hasHeader('Authorization'));
        $this->assertSame(1.2, $timeouts[1]['timeout']);
        $this->assertSame(1.2, $timeouts[1]['connect_timeout']);
    }

    public function test_http_client_rejects_consequential_tool_calls_without_action_authorization(): void
    {
        Http::fake(['*' => Http::response($this->validResult('unsigned-click'))]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token', 15);

        $this->expectException(BrowserWorkerException::class);
        $this->expectExceptionMessage('action capability');

        $client->callTool(
            'talos-user:1',
            'worker-1',
            'unsigned-click',
            'browser_click',
            ['target' => 'r1', 'snapshot_id' => 'snap_1', 'state_version' => 1],
        );
    }

    public function test_http_client_sends_a_signed_action_bearer_only_for_an_authorized_click(): void
    {
        Http::fake(['*' => Http::response($this->validResult('signed-click'))]);
        $client = new HttpBrowserSessionClient(
            'http://browser-worker.test',
            'worker-token',
            15,
            $this->actionCapabilityIssuer(),
        );

        $result = $client->callTool(
            'talos-user:1',
            'worker-1',
            'signed-click',
            'browser_click',
            ['target' => 'r1', 'snapshot_id' => 'snap_1', 'state_version' => 1],
            15000,
            BrowserActionAuthorization::policy('signed-click'),
        );

        $this->assertSame('signed-click', $result->toolUseId);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request['tool_use_id'] === 'signed-click'
            && $request['name'] === 'browser_click'
            && $request['arguments']['state_version'] === 1
            && preg_match('/^Bearer [^.]+\.[^.]+\.[^.]+$/D', $request->header('Authorization')[0] ?? '') === 1);
    }

    public function test_http_client_enables_upload_only_when_negotiated_and_stages_exact_bytes(): void
    {
        $handshake = $this->validHandshake();
        $handshake['data']['capability_manifest']['capabilities'][] = 'upload';
        $requests = [];
        Http::fake(function ($request) use (&$requests, $handshake) {
            $requests[] = ['method' => $request->method(), 'url' => $request->url(), 'body' => $request->data()];
            if ($request->method() === 'GET') {
                return Http::response($handshake);
            }
            if ($request->method() === 'DELETE') {
                return Http::response([], 204);
            }
            if (str_contains($request->url(), '/files/stage/')) {
                return Http::response(['data' => [
                    'stage_id' => 'stg_11111111-1111-4111-8111-111111111111',
                    'file_id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    'name' => 'proof.txt',
                    'mime_type' => 'text/plain',
                    'size_bytes' => 5,
                    'sha256' => 'sha256:'.hash('sha256', 'proof'),
                    'expires_at' => '2026-07-17T12:02:00.000Z',
                ]]);
            }

            return Http::response($this->validSessionBootstrap([
                'capabilities' => [
                    'navigation' => true,
                    'screenshots' => true,
                    'accessibilitySnapshot' => true,
                    'actions' => false,
                    'hmiActions' => true,
                    'downloads' => false,
                    'uploads' => true,
                ],
            ]));
        });
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->create('talos-user:1', 1280, 800);
        $stageId = 'stg_11111111-1111-4111-8111-111111111111';
        $staged = $client->stageFile('talos-user:1', 'worker-1', $stageId, [
            'file_id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'name' => 'proof.txt',
            'mime_type' => 'text/plain',
            'size_bytes' => 5,
            'sha256' => 'sha256:'.hash('sha256', 'proof'),
            'base64' => base64_encode('proof'),
        ]);
        $client->discardStagedFile('talos-user:1', 'worker-1', $staged['stage_id']);

        $this->assertTrue($requests[1]['body']['capabilities']['uploads']);
        $this->assertSame('stg_11111111-1111-4111-8111-111111111111', $staged['stage_id']);
        $this->assertSame(base64_encode('proof'), $requests[2]['body']['base64']);
        $this->assertSame('PUT', $requests[2]['method']);
        $this->assertSame('http://browser-worker.test/sessions/worker-1/files/stage/'.$stageId, $requests[2]['url']);
        $this->assertSame('DELETE', $requests[3]['method']);
        $this->assertSame('http://browser-worker.test/sessions/worker-1/files/stage/'.$staged['stage_id'], $requests[3]['url']);
        $this->assertSame([], $requests[3]['body']);
    }

    public function test_http_client_upload_requires_a_user_approval_action_capability(): void
    {
        Http::fake(['*' => Http::response($this->validResult('upload-call'))]);
        $client = new HttpBrowserSessionClient(
            'http://browser-worker.test',
            'worker-token',
            15,
            $this->actionCapabilityIssuer(),
        );
        $arguments = [
            'target' => 'r4',
            'staged_file_ids' => ['stg_11111111-1111-4111-8111-111111111111'],
            'snapshot_id' => 'snap_1',
            'state_version' => 1,
        ];

        try {
            $client->callTool(
                'talos-user:1',
                'worker-1',
                'upload-call',
                'browser_file_upload',
                $arguments,
                authorization: BrowserActionAuthorization::policy('upload-call'),
            );
            $this->fail('A policy-only upload authorization was accepted.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_ACTION_CAPABILITY_INVALID', $exception->errorCode);
        }

        $result = $client->callTool(
            'talos-user:1',
            'worker-1',
            'upload-call',
            'browser_file_upload',
            $arguments,
            authorization: BrowserActionAuthorization::userApproval(
                'upload-call',
                'approval-upload',
                'sha256:'.str_repeat('a', 64),
                'execution-lease-upload',
            ),
        );

        $this->assertSame('upload-call', $result->toolUseId);
        Http::assertSent(fn ($request): bool => $request['name'] === 'browser_file_upload'
            && preg_match('/^Bearer [^.]+\.[^.]+\.[^.]+$/D', $request->header('Authorization')[0] ?? '') === 1);
    }

    public function test_container_injects_the_configured_action_capability_issuer_into_the_http_client(): void
    {
        $keypair = $this->actionCapabilityConfiguration();
        config([
            'services.talos.browser.client_driver' => 'http',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'worker-token',
            'services.talos.browser.action_private_key_b64' => $keypair['privateKeyBase64'],
            'services.talos.browser.action_key_id' => $keypair['keyId'],
        ]);
        $this->app->forgetInstance(BrowserWorkerConfiguration::class);
        $this->app->forgetInstance(TalosBrowserActionCapabilityIssuer::class);
        Http::fake(['*' => Http::response($this->validResult('container-signed-click'))]);

        $client = $this->app->make(BrowserSessionClient::class);
        $result = $client->callTool(
            'talos-user:1',
            'worker-1',
            'container-signed-click',
            'browser_click',
            ['target' => 'r1', 'snapshot_id' => 'snap_1', 'state_version' => 1],
            15000,
            BrowserActionAuthorization::policy('container-signed-click'),
        );

        $this->assertSame('container-signed-click', $result->toolUseId);
        Http::assertSent(fn ($request): bool => preg_match(
            '/^Bearer [^.]+\.[^.]+\.[^.]+$/D',
            $request->header('Authorization')[0] ?? '',
        ) === 1);
    }

    public function test_production_boot_fails_closed_when_action_capability_issuance_is_not_configured(): void
    {
        config([
            'services.talos.browser.action_private_key_b64' => '',
            'services.talos.browser.action_key_id' => '',
        ]);
        $this->app->forgetInstance(TalosBrowserActionCapabilityIssuer::class);
        $originalEnvironment = $this->app->environment();
        $this->app->instance('env', 'production');

        try {
            (new AppServiceProvider($this->app))->boot(
                $this->app->make(Vite::class),
                new BrowserWorkerConfiguration(
                    'https://browser-worker.internal',
                    bin2hex(random_bytes(32)),
                ),
                $this->app->make(UrlGenerator::class),
            );
            $this->fail('Production boot accepted a missing browser action capability issuer.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID', $exception->errorCode);
        } finally {
            $this->app->instance('env', $originalEnvironment);
        }
    }

    public function test_http_client_rejects_malformed_success_without_exposing_worker_details(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/tools/call' => Http::response([
            'schema_version' => 'wrong',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [],
            'structuredContent' => null,
            'evidence' => [],
            'internal' => 'do not expose',
        ])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        try {
            $client->callTool('talos-user:1', 'worker-1', 'call-1', 'browser_snapshot', [], 15000);
            $this->fail('Malformed success response was accepted.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_WORKER_FAILURE', $exception->errorCode);
            $this->assertSame('Browser worker returned an invalid tool result.', $exception->getMessage());
            $this->assertStringNotContainsString('do not expose', $exception->getMessage());
        }
    }

    public function test_http_client_rejects_a_malformed_tool_definitions_success(): void
    {
        Http::fake(['http://browser-worker.test/tools' => Http::response(['data' => ['tools' => [['not' => 'a definition list item']]]])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool definitions response.'));
        $client->toolDefinitions('talos-user:1');
    }

    public function test_http_client_applies_explicit_deadlines_to_create_and_close(): void
    {
        $timeouts = [];
        Http::fake(function ($request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'];

            return match ($request->method()) {
                'GET' => Http::response($this->validHandshake()),
                'POST' => Http::response($this->validSessionBootstrap()),
                'DELETE' => Http::response([], 204),
                default => Http::response([], 405),
            };
        });
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token', 15);

        $client->create('owner-1', 1280, 800, 900);
        $client->close('owner-1', 'worker-1', 75);

        $this->assertSame([0.9, 0.9, 0.075], $timeouts);
    }

    public function test_http_client_and_fake_use_the_dedicated_worker_cancellation_contract(): void
    {
        Http::fake([
            'http://browser-worker.test/sessions/worker-1/cancel' => Http::response([], 204),
        ]);
        $http = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');
        $http->cancel('owner-1', 'worker-1', 'User cancelled the Browser task.', 250);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request->url() === 'http://browser-worker.test/sessions/worker-1/cancel'
            && $request['reason'] === 'User cancelled the Browser task.');

        $fake = new FakeBrowserSessionClient;
        $created = $fake->create('owner-1', 1280, 800);
        $fake->cancel('owner-1', $created['sessionId'], 'User cancelled the Browser task.', 250);

        $this->assertSame('cancel', $fake->requests[1]['method']);
        $this->assertSame('User cancelled the Browser task.', $fake->requests[1]['reason']);
        $this->assertSame(250, $fake->requests[1]['timeoutMilliseconds']);
    }

    public function test_http_client_bootstraps_sessions_through_the_exact_worker_protocol(): void
    {
        $url = 'http://browser-worker.test/protocols/'.TalosBrowserWorkerProtocol::HMI_RUNTIME.'/sessions';
        Http::fake([
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::HANDSHAKE_PATH => Http::response($this->validHandshake()),
            $url => Http::response($this->validSessionBootstrap()),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $session = $client->create('owner-1', 1280, 800);

        $this->assertSame('worker-1', $session['sessionId']);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && $request->url() === $url);
    }

    public function test_http_client_uses_the_versioned_idempotent_bootstrap_path_and_structured_header(): void
    {
        Http::fake([
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::HANDSHAKE_PATH => Http::response($this->validHandshake()),
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::IDEMPOTENT_SESSION_BOOTSTRAP_PATH => Http::response($this->validSessionBootstrap()),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');
        $key = '123e4567-e89b-42d3-a456-426614174444';

        $session = $client->createIdempotent('owner-1', 1280, 800, $key);

        $this->assertSame('worker-1', $session['sessionId']);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request->url() === 'http://browser-worker.test'.TalosBrowserWorkerProtocol::IDEMPOTENT_SESSION_BOOTSTRAP_PATH
            && $request->header('Idempotency-Key') === ['"'.$key.'"']);
    }

    public function test_fake_idempotent_bootstrap_replays_live_session_rejects_changed_intent_and_expires_on_close(): void
    {
        $client = new FakeBrowserSessionClient;
        $key = '123e4567-e89b-42d3-a456-426614174555';

        $first = $client->createIdempotent('owner-1', 1280, 800, $key);
        $replay = $client->createIdempotent('owner-1', 1280, 800, $key);

        $this->assertSame($first['sessionId'], $replay['sessionId']);
        try {
            $client->createIdempotent('owner-1', 1440, 900, $key);
            $this->fail('A changed Browser bootstrap intent reused an idempotency key.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_SESSION_IDEMPOTENCY_CONFLICT', $exception->errorCode);
        }

        $client->close('owner-1', $first['sessionId']);
        $replacement = $client->createIdempotent('owner-1', 1280, 800, $key);
        $this->assertNotSame($first['sessionId'], $replacement['sessionId']);
    }

    public function test_fresh_fake_clients_allocate_unique_real_worker_namespaced_session_ids(): void
    {
        $first = (new FakeBrowserSessionClient)->create('owner-1', 1280, 800);
        $second = (new FakeBrowserSessionClient)->create('owner-1', 1280, 800);

        $this->assertMatchesRegularExpression(
            '/^brw_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D',
            (string) $first['sessionId'],
        );
        $this->assertMatchesRegularExpression(
            '/^brw_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D',
            (string) $second['sessionId'],
        );
        $this->assertNotSame($first['sessionId'], $second['sessionId']);
    }

    public function test_http_client_rejects_a_mismatched_worker_protocol_during_session_bootstrap(): void
    {
        Http::fakeSequence()
            ->push($this->validHandshake())
            ->push($this->validSessionBootstrap([
                'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.0.0'],
            ]));
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        try {
            $client->create('owner-1', 1280, 800);
            $this->fail('A mismatched browser worker protocol was accepted.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH', $exception->errorCode);
        }
    }

    public function test_http_client_forwards_navigate_deadline_to_worker_payload(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/navigate' => Http::response([
            'data' => ['url' => 'https://example.com', 'title' => 'Example'],
        ])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->navigate('owner-1', 'worker-1', 'https://example.com', 731);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request->url() === 'http://browser-worker.test/sessions/worker-1/navigate'
            && $request['url'] === 'https://example.com'
            && $request['timeoutMs'] === 731);
    }

    public function test_http_client_forwards_an_explicit_create_ttl_to_the_worker(): void
    {
        Http::fake([
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::HANDSHAKE_PATH => Http::response($this->validHandshake()),
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH => Http::response($this->validSessionBootstrap()),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->create('owner-1', 1280, 800, 731, 15);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request->url() === 'http://browser-worker.test'.TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH
            && $request['ttlSeconds'] === 15);
    }

    public function test_http_client_uses_versioned_hmi_pointer_routes_and_preserves_wire_shapes(): void
    {
        Http::fake(function ($request) {
            return Http::response(['data' => str_ends_with($request->url(), '/preflight')
                ? [
                    'schema_version' => 'talos_browser_hmi_preflight_v2',
                    'interaction_id' => self::HMI_INTERACTION_ID,
                    'session_id' => 'worker-1',
                    'state_version' => 4,
                    'frame_sha256' => 'sha256:'.str_repeat('c', 64),
                    'origin' => 'https://example.com',
                    'point' => ['normalized_x' => 0.25, 'normalized_y' => 0.5, 'x' => 320, 'y' => 400],
                    'target' => [
                        'tag' => 'button', 'role' => 'button', 'name' => 'Close',
                        'input_type' => null, 'href' => null, 'form_method' => null,
                        'is_editable' => false, 'is_submit' => false, 'is_download' => false,
                        'opens_new_context' => false, 'visible' => true, 'disabled' => false,
                        'effect_attestation' => 'browser_default', 'required_effect_classification' => 'ordinary',
                        'fingerprint' => 'sha256:'.str_repeat('a', 64),
                    ],
                ]
                : [
                    'schema_version' => 'talos_browser_hmi_result_v2',
                    'capture_id' => 'cap-1',
                    'interaction_id' => self::HMI_INTERACTION_ID,
                    'command_id' => 'hmi-contract-1',
                    'session_id' => 'worker-1',
                    'source_state_version' => 4,
                    'state_version' => 5,
                    'frame_sha256' => 'sha256:'.str_repeat('c', 64),
                    'url' => 'https://example.com',
                    'title' => 'Example',
                    'effect_classification' => 'ordinary',
                    'sensitive_effect_authorized' => false,
                    'target' => [
                        'tag' => 'button', 'role' => 'button', 'name' => 'Close',
                        'input_type' => null, 'href' => null, 'form_method' => null,
                        'is_editable' => false, 'is_submit' => false, 'is_download' => false,
                        'opens_new_context' => false, 'visible' => true, 'disabled' => false,
                        'effect_attestation' => 'browser_default', 'required_effect_classification' => 'ordinary',
                        'fingerprint' => 'sha256:'.str_repeat('a', 64),
                    ],
                    'screenshot' => ['mime_type' => 'image/png', 'width' => 1280, 'height' => 800, 'sha256' => 'sha256:'.hash('sha256', 'png'), 'base64' => base64_encode('png')],
                    'snapshot' => [
                        'snapshot_id' => 'snap-contract-1', 'format' => 'accessibility_refs_v1',
                        'text_digest' => '', 'sha256' => 'sha256:'.str_repeat('d', 64),
                        'nodes' => [], 'empty_object' => new \stdClass,
                    ],
                    'captured_at' => now()->toJSON(),
                ]]);
        });
        $client = new HttpBrowserSessionClient(
            'http://browser-worker.test',
            'worker-token',
            15,
            $this->actionCapabilityIssuer(),
        );
        $preflight = $client->preflightPointer('owner-1', 'worker-1', [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 4,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.25,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ]);
        $executePayload = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'command_id' => 'hmi-contract-1',
            'state_version' => 4,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.25,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
            'expected_fingerprint' => $preflight['target']['fingerprint'],
            'effect_classification' => 'ordinary',
            'sensitive_effect_authorized' => false,
        ];
        $result = $client->executePointer(
            'owner-1',
            'worker-1',
            $executePayload,
            15000,
            BrowserActionAuthorization::userApproval(
                'hmi-contract-1',
                'approval-1',
                'sha256:'.str_repeat('e', 64),
                'execution-lease-1',
            ),
        );

        $this->assertSame('sha256:'.str_repeat('a', 64), $preflight['target']['fingerprint']);
        $this->assertInstanceOf(\stdClass::class, $result['snapshot']['empty_object']);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request): bool => $request->url() === 'http://browser-worker.test/sessions/worker-1/hmi/pointer/preflight'
            && $request->hasHeader('X-Talos-Owner-Ref', 'owner-1')
            && $request['schema_version'] === 'talos_browser_hmi_pointer_v2'
            && $request['expected_frame_sha256'] === 'sha256:'.str_repeat('c', 64));
        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/hmi/pointer/execute')
            && preg_match('/^Bearer [^.]+\.[^.]+\.[^.]+$/D', $request->header('Authorization')[0] ?? '') === 1);
    }

    public function test_http_client_create_enables_hmi_actions_without_enabling_model_actions(): void
    {
        Http::fake([
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::HANDSHAKE_PATH => Http::response($this->validHandshake()),
            'http://browser-worker.test'.TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH => Http::response($this->validSessionBootstrap()),
        ]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->create('owner-1', 1280, 800);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && $request['capabilities']['hmiActions'] === true
            && $request['capabilities']['actions'] === false);
    }

    public function test_http_client_maps_worker_error_envelopes_to_typed_errors(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/hmi/pointer/preflight' => Http::response([
            'code' => 'TALOS_BROWSER_HMI_CAPABILITY_DENIED',
            'message' => 'HMI disabled',
            'details' => ['internal' => 'not exposed'],
        ], 403)]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException('TALOS_BROWSER_HMI_CAPABILITY_DENIED', 'HMI disabled'));
        $client->preflightPointer('owner-1', 'worker-1', [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ]);
    }

    public function test_http_client_preserves_only_a_bounded_worker_recovery_reason(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/hmi/pointer/execute' => Http::response([
            'code' => 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED',
            'message' => 'The browser action may have taken effect.',
            'details' => [
                'reason_code' => 'evidence_frame_changed',
                'state_version' => 2,
                'internal' => 'must not cross the adapter boundary',
            ],
        ], 409)]);
        $client = new HttpBrowserSessionClient(
            'http://browser-worker.test',
            'worker-token',
            15,
            $this->actionCapabilityIssuer(),
        );

        try {
            $payload = [
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => self::HMI_INTERACTION_ID,
                'state_version' => 1,
                'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
                'normalized_x' => 0.5,
                'normalized_y' => 0.5,
                'button' => 'left',
                'click_count' => 1,
                'command_id' => 'hmi_reason_contract',
                'expected_fingerprint' => 'sha256:'.str_repeat('d', 64),
                'effect_classification' => 'sensitive',
                'sensitive_effect_authorized' => true,
            ];
            $client->executePointer(
                'owner-1',
                'worker-1',
                $payload,
                15000,
                BrowserActionAuthorization::userApproval(
                    'hmi_reason_contract',
                    'approval-reason',
                    'sha256:'.str_repeat('e', 64),
                    'execution-lease-reason',
                ),
            );
            self::fail('Expected the worker recovery exception.');
        } catch (BrowserWorkerException $exception) {
            self::assertSame('TALOS_BROWSER_HMI_RECOVERY_REQUIRED', $exception->errorCode);
            self::assertSame(['reason_code' => 'evidence_frame_changed'], $exception->details);
        }
    }

    public function test_http_client_rejects_an_unbounded_or_malformed_hmi_success_envelope(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/hmi/pointer/preflight' => Http::response([
            'data' => [
                'schema_version' => 'talos_browser_hmi_preflight_v2',
                'interaction_id' => self::HMI_INTERACTION_ID,
                'session_id' => 'worker-1',
                'state_version' => 1,
                'frame_sha256' => 'sha256:'.str_repeat('c', 64),
                'point' => [],
                'target' => ['fingerprint' => 'not-a-hash'],
            ],
        ])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI preflight response.'));
        $client->preflightPointer('owner-1', 'worker-1', [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ]);
    }

    public function test_http_client_rejects_a_preflight_target_with_an_inconsistent_effect_attestation(): void
    {
        Http::fake(['http://browser-worker.test/sessions/worker-1/hmi/pointer/preflight' => Http::response([
            'data' => [
                'schema_version' => 'talos_browser_hmi_preflight_v2',
                'interaction_id' => self::HMI_INTERACTION_ID,
                'session_id' => 'worker-1',
                'state_version' => 0,
                'frame_sha256' => 'sha256:'.str_repeat('c', 64),
                'origin' => 'https://example.com',
                'point' => ['normalized_x' => 0.5, 'normalized_y' => 0.5, 'x' => 640, 'y' => 400],
                'target' => [
                    'tag' => 'button',
                    'role' => 'button',
                    'name' => 'Close',
                    'input_type' => null,
                    'href' => null,
                    'form_method' => null,
                    'is_editable' => false,
                    'is_submit' => false,
                    'is_download' => false,
                    'opens_new_context' => false,
                    'effect_attestation' => 'unattestable',
                    'required_effect_classification' => 'ordinary',
                    'visible' => true,
                    'disabled' => false,
                    'fingerprint' => 'sha256:'.str_repeat('a', 64),
                ],
            ],
        ])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $this->expectExceptionObject(new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI preflight response.'));
        $client->preflightPointer('owner-1', 'worker-1', [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ]);
    }

    public function test_fake_client_records_new_requests_and_preserves_legacy_methods(): void
    {
        $defaultClient = new FakeBrowserSessionClient;
        $this->assertInstanceOf(BrowserToolResult::class, $defaultClient->callTool('owner-1', 'worker-1', 'call-default', 'browser_snapshot', []));

        $client = new FakeBrowserSessionClient;
        $client->toolDefinitionsResponse = [['name' => 'browser_snapshot']];
        $client->callToolResponse = BrowserToolResult::fromArray($this->validResult('call-1'), 'call-1');

        $this->assertSame([['name' => 'browser_snapshot']], $client->toolDefinitions('owner-1'));
        $this->assertSame('call-1', $client->callTool('owner-1', 'worker-1', 'call-1', 'browser_snapshot', [], 900)->toolUseId);
        $this->assertSame('ready', $client->inspect('owner-1', 'worker-1')['status']);
        $client->close('owner-1', 'worker-1', 700);

        $this->assertSame('toolDefinitions', $client->requests[0]['method']);
        $this->assertSame('snapshot', $client->requests[1]['method']);
        $this->assertSame('callTool', $client->requests[1]['transport_method']);
        $this->assertSame(900, $client->requests[1]['timeoutMs']);
        $this->assertSame('inspect', $client->requests[2]['method']);
        $this->assertSame('close', $client->requests[3]['method']);
        $this->assertSame(700, $client->requests[3]['timeoutMilliseconds']);
    }

    public function test_fake_inspection_fallback_reports_the_pinned_device_scale_factor(): void
    {
        $summary = (new FakeBrowserSessionClient)->inspect('owner-1', 'worker-without-create');

        $this->assertSame(1, $summary['deviceScaleFactor'] ?? null);
    }

    public function test_fake_hmi_v2_result_uses_the_canonical_snapshot_digest_and_stable_target(): void
    {
        $client = new FakeBrowserSessionClient;
        $payload = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ];

        $preflight = $client->preflightPointer('owner-1', 'worker-1', $payload);
        $result = $client->executePointer('owner-1', 'worker-1', [
            ...$payload,
            'command_id' => 'command-stable',
            'expected_fingerprint' => $preflight['target']['fingerprint'],
            'effect_classification' => $preflight['target']['required_effect_classification'],
            'sensitive_effect_authorized' => $preflight['target']['required_effect_classification'] === 'sensitive',
        ]);
        $snapshot = $result['snapshot'];
        $canonicalSnapshot = [
            'format' => $snapshot['format'],
            'nodes' => $snapshot['nodes'],
            'snapshot_id' => $snapshot['snapshot_id'],
            'text_digest' => $snapshot['text_digest'],
        ];

        $this->assertSame($preflight['target']['fingerprint'], $result['target']['fingerprint']);
        $this->assertSame(
            'sha256:'.hash('sha256', json_encode($canonicalSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)),
            $snapshot['sha256'],
        );
    }

    public function test_fake_hmi_result_preserves_the_preflight_target_when_policy_only_raises_execution_risk(): void
    {
        $client = new FakeBrowserSessionClient;
        $pointer = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ];
        $preflight = $client->preflightPointer('owner-1', 'worker-1', $pointer);

        $result = $client->executePointer('owner-1', 'worker-1', [
            ...$pointer,
            'command_id' => 'command-policy-elevation',
            'expected_fingerprint' => $preflight['target']['fingerprint'],
            'effect_classification' => 'sensitive',
            'sensitive_effect_authorized' => true,
        ]);

        $this->assertSame($preflight['target'], $result['target']);
        $this->assertSame('ordinary', $result['target']['required_effect_classification']);
        $this->assertSame('sensitive', $result['effect_classification']);
        $this->assertTrue($result['sensitive_effect_authorized']);
    }

    public function test_fake_client_preserves_created_viewport_and_hmi_state_for_reconciliation(): void
    {
        $client = new FakeBrowserSessionClient;
        $created = $client->create('owner-1', 1440, 900);
        $payload = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'command_id' => 'command-stateful-fake',
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'expected_fingerprint' => 'sha256:'.str_repeat('a', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
            'effect_classification' => 'ordinary',
            'sensitive_effect_authorized' => false,
        ];

        $before = $client->inspect('owner-1', $created['sessionId']);
        $executed = $client->executePointer('owner-1', $created['sessionId'], $payload);
        $after = $client->inspect('owner-1', $created['sessionId']);

        $this->assertSame(['width' => 1440, 'height' => 900], $before['viewport']);
        $this->assertSame(0, $before['stateVersion']);
        $this->assertSame($executed['state_version'], $after['stateVersion']);
        $this->assertSame('active', $after['status']);
    }

    public function test_fake_hmi_v2_result_is_accepted_by_the_capture_contract(): void
    {
        $client = new FakeBrowserSessionClient;
        $payload = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ];
        $preflight = $client->preflightPointer('owner-1', 'worker-1', $payload);
        $result = $client->executePointer('owner-1', 'worker-1', [
            ...$payload,
            'command_id' => 'command-1',
            'expected_fingerprint' => $preflight['target']['fingerprint'],
            'effect_classification' => $preflight['target']['required_effect_classification'],
            'sensitive_effect_authorized' => $preflight['target']['required_effect_classification'] === 'sensitive',
        ]);
        $session = new TalosBrowserSession([
            'worker_session_id' => 'worker-1',
            'viewport_width' => 1280,
            'viewport_height' => 800,
        ]);
        $validator = (new \ReflectionClass(TalosBrowserArtifactStore::class))->getMethod('validatedHmiCapture');
        $validator->setAccessible(true);

        $validator->invoke(app(TalosBrowserArtifactStore::class), $session, 'command-1', $result);
        $this->addToAssertionCount(1);
    }

    public function test_fake_hmi_v2_targets_are_deterministic_for_ordinary_and_sensitive_points(): void
    {
        $client = new FakeBrowserSessionClient;
        $basePayload = [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => self::HMI_INTERACTION_ID,
            'state_version' => 0,
            'expected_frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
        ];

        foreach ([
            ['normalized_x' => 0.5, 'name' => 'Close', 'is_submit' => false],
            ['normalized_x' => 0.25, 'name' => 'Buy now', 'is_submit' => true],
        ] as $case) {
            $normalizedX = $case['normalized_x'];
            $payload = [...$basePayload, 'normalized_x' => $normalizedX];
            $preflight = $client->preflightPointer('owner-1', 'worker-1', $payload);
            $result = $client->executePointer('owner-1', 'worker-1', [
                ...$payload,
                'command_id' => 'command-'.($case['is_submit'] ? 'sensitive' : 'ordinary'),
                'expected_fingerprint' => $preflight['target']['fingerprint'],
                'effect_classification' => $preflight['target']['required_effect_classification'],
                'sensitive_effect_authorized' => $preflight['target']['required_effect_classification'] === 'sensitive',
            ]);

            $this->assertSame($case['name'], $preflight['target']['name']);
            $this->assertSame($case['is_submit'], $preflight['target']['is_submit']);
            $this->assertSame($preflight['target'], $result['target']);
        }
    }

    public function test_fake_client_default_snapshot_satisfies_the_legacy_snapshot_contract(): void
    {
        $client = new FakeBrowserSessionClient;

        $snapshot = LegacyBrowserSnapshot::fromWorker($client->snapshot('owner-1', 'worker-1'));

        $this->assertSame('snap_fake_legacy_1', $snapshot->snapshotId);
        $this->assertSame('accessibility_refs_v1', $snapshot->toArray()['format']);
    }

    public function test_fake_client_default_screenshot_matches_the_worker_contract_without_normalizing_custom_responses(): void
    {
        $client = new FakeBrowserSessionClient;

        $default = $client->screenshot('owner-1', 'worker-42');
        $bytes = base64_decode((string) $default['base64'], true);

        $this->assertSame('worker-42', $default['sessionId']);
        $this->assertSame(0, $default['stateVersion']);
        $this->assertSame('image/png', $default['mime']);
        $this->assertSame(1280, $default['width']);
        $this->assertSame(800, $default['height']);
        $this->assertIsString($bytes);
        $this->assertSame(hash('sha256', $bytes), $default['sha256']);

        $custom = ['invalid' => true];
        $client->screenshotResponse = $custom;
        $this->assertSame($custom, $client->screenshot('owner-1', 'worker-42'));
    }

    private function actionCapabilityIssuer(): TalosBrowserActionCapabilityIssuer
    {
        $keypair = $this->actionCapabilityConfiguration();

        return new TalosBrowserActionCapabilityIssuer(
            $keypair['privateKeyBase64'],
            $keypair['keyId'],
        );
    }

    /** @return array{privateKeyBase64: string, keyId: string} */
    private function actionCapabilityConfiguration(): array
    {
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        $this->assertNotFalse($key);
        $privateKey = '';
        $this->assertTrue(openssl_pkey_export($key, $privateKey));

        return [
            'privateKeyBase64' => base64_encode($privateKey),
            'keyId' => 'browser-action-test-key',
        ];
    }

    /** @return array<string, mixed> */
    private function validResult(string $toolUseId): array
    {
        return [
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => $toolUseId,
            'isError' => false,
            'content' => [['type' => 'text', 'text' => 'ok']],
            'structuredContent' => null,
            'evidence' => [],
        ];
    }

    /** @return array<string, mixed> */
    private function validHandshake(): array
    {
        return ['data' => [
            'schema_version' => TalosBrowserWorkerProtocol::HANDSHAKE_SCHEMA,
            'protocol_version' => TalosBrowserWorkerProtocol::WORKER,
            'worker' => [
                'name' => 'talos-browser-worker',
                'version' => '0.1.0',
                'instance_id' => '123e4567-e89b-42d3-a456-426614174000',
            ],
            'adapter' => ['name' => TalosBrowserWorkerProtocol::ADAPTER_NAME, 'version' => TalosBrowserWorkerProtocol::ADAPTER_VERSION],
            'browser' => ['engine' => 'chromium', 'version' => '149.0.7827.55'],
            'capability_manifest' => [
                'schema_version' => 'talos.browser.capabilities.v1',
                'protocol_version' => TalosBrowserWorkerProtocol::WORKER,
                'adapter_name' => TalosBrowserWorkerProtocol::ADAPTER_NAME,
                'adapter_version' => TalosBrowserWorkerProtocol::ADAPTER_VERSION,
                'capabilities' => TalosBrowserWorkerProtocol::REQUIRED_CAPABILITIES,
                'limits' => [
                    'max_tabs' => 1,
                    'max_viewport_width' => 3840,
                    'max_viewport_height' => 2160,
                    'max_artifact_bytes' => 5_000_000,
                ],
                'degraded_reason' => null,
            ],
            'authentication' => [
                'mode' => 'service_token_and_signed_action_capability',
                'owner_binding' => true,
                'action_capability' => [
                    'schema_version' => TalosBrowserActionCapabilityIssuer::SCHEMA_VERSION,
                    'algorithm' => 'ES256',
                    'type' => TalosBrowserActionCapabilityIssuer::TYPE,
                    'issuer' => TalosBrowserActionCapabilityIssuer::ISSUER,
                    'audience' => TalosBrowserActionCapabilityIssuer::AUDIENCE,
                    'key_id' => 'browser-action-test-key',
                    'max_ttl_seconds' => TalosBrowserActionCapabilityIssuer::MAX_TTL_SECONDS,
                ],
            ],
            'status' => 'ready',
            'degraded_reason' => null,
        ]];
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function validSessionBootstrap(array $overrides = []): array
    {
        return ['data' => array_replace_recursive([
            'sessionId' => 'worker-1',
            'workerInstanceId' => '123e4567-e89b-42d3-a456-426614174000',
            'status' => 'ready',
            'mode' => 'read_only',
            'protocols' => [
                'worker' => TalosBrowserWorkerProtocol::WORKER,
                'hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME,
            ],
        ], $overrides)];
    }
}
