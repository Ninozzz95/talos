<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserSession;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\LegacyBrowserSnapshot;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserWorkerProtocol;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosBrowserSessionClientContractTest extends TestCase
{
    private const HMI_INTERACTION_ID = '123e4567-e89b-42d3-a456-426614174000';

    public function test_browser_session_client_declares_the_versioned_hmi_operations(): void
    {
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'preflightPointer'));
        $this->assertTrue(method_exists(BrowserSessionClient::class, 'executePointer'));
        $this->assertSame(BrowserSessionClient::class, (new \ReflectionMethod(BrowserSessionClient::class, 'preflightPointer'))->getDeclaringClass()->getName());
        $this->assertSame(BrowserSessionClient::class, (new \ReflectionMethod(BrowserSessionClient::class, 'executePointer'))->getDeclaringClass()->getName());
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
            && $request->hasHeader('X-Talos-Owner-Ref', 'talos-user:1'));
        $this->assertSame(1.2, $timeouts[1]['timeout']);
        $this->assertSame(1.2, $timeouts[1]['connect_timeout']);
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

            return $request->method() === 'DELETE'
                ? Http::response([], 204)
                : Http::response(['data' => [
                    'sessionId' => 'worker-1',
                    'mode' => 'read_only',
                    'protocols' => ['hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME],
                ]]);
        });
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token', 15);

        $client->create('owner-1', 1280, 800, 900);
        $client->close('owner-1', 'worker-1', 75);

        $this->assertSame([0.9, 0.075], $timeouts);
    }

    public function test_http_client_bootstraps_sessions_through_the_exact_worker_protocol(): void
    {
        $url = 'http://browser-worker.test/protocols/'.TalosBrowserWorkerProtocol::HMI_RUNTIME.'/sessions';
        Http::fake([$url => Http::response(['data' => [
            'sessionId' => 'worker-1',
            'mode' => 'read_only',
            'protocols' => ['hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME],
        ]])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $session = $client->create('owner-1', 1280, 800);

        $this->assertSame('worker-1', $session['sessionId']);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && $request->url() === $url);
    }

    public function test_http_client_rejects_a_mismatched_worker_protocol_during_session_bootstrap(): void
    {
        Http::fake(['*' => Http::response(['data' => [
            'sessionId' => 'worker-1',
            'mode' => 'read_only',
            'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.0.0'],
        ]])]);
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
        Http::fake(['http://browser-worker.test'.TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH => Http::response([
            'data' => [
                'sessionId' => 'worker-1',
                'mode' => 'read_only',
                'protocols' => ['hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME],
            ],
        ])]);
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
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');
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
        $result = $client->executePointer('owner-1', 'worker-1', [
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
        ]);

        $this->assertSame('sha256:'.str_repeat('a', 64), $preflight['target']['fingerprint']);
        $this->assertInstanceOf(\stdClass::class, $result['snapshot']['empty_object']);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request): bool => $request->url() === 'http://browser-worker.test/sessions/worker-1/hmi/pointer/preflight'
            && $request->hasHeader('X-Talos-Owner-Ref', 'owner-1')
            && $request['schema_version'] === 'talos_browser_hmi_pointer_v2'
            && $request['expected_frame_sha256'] === 'sha256:'.str_repeat('c', 64));
    }

    public function test_http_client_create_enables_hmi_actions_without_enabling_model_actions(): void
    {
        Http::fake(['http://browser-worker.test'.TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH => Http::response(['data' => [
            'sessionId' => 'worker-1',
            'protocols' => ['hmi' => TalosBrowserWorkerProtocol::HMI_RUNTIME],
        ]])]);
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        $client->create('owner-1', 1280, 800);

        Http::assertSent(fn ($request): bool => $request['capabilities']['hmiActions'] === true
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
        $client = new HttpBrowserSessionClient('http://browser-worker.test', 'worker-token');

        try {
            $client->executePointer('owner-1', 'worker-1', [
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
            ]);
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
}
