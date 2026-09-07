<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosToolRegistryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();

        config(['services.talos.registry_write_token' => 'registry-test-token']);
    }

    public function test_registry_write_routes_require_admin_token(): void
    {
        $this->postJson('/api/talos/connectors', [
            'key' => 'core_http',
            'display_name' => 'Core HTTP',
        ])->assertForbidden();
    }

    public function test_connector_and_tool_can_be_registered_with_real_schema(): void
    {
        $connectorId = $this->registryPost('/api/talos/connectors', [
            'key' => 'core_http',
            'display_name' => 'Core HTTP',
            'description' => 'Policy-gated HTTP worker connector.',
            'is_enabled' => true,
            'health_status' => 'healthy',
            'capabilities' => ['http.request'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.key', 'core_http')
            ->assertJsonPath('data.is_enabled', true)
            ->json('data.id');

        $this->registryPost('/api/talos/tools', [
            'connector_id' => $connectorId,
            'name' => 'HTTP_REQUEST',
            'display_name' => 'HTTP request',
            'description' => 'Executes a policy-gated HTTP request.',
            'input_schema' => [
                'type' => 'object',
                'required' => ['url'],
                'properties' => [
                    'url' => ['type' => 'string', 'format' => 'uri'],
                ],
            ],
            'risk_level' => 'medium',
            'capability' => 'http.request',
            'is_enabled' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'HTTP_REQUEST')
            ->assertJsonPath('data.input_schema.required.0', 'url')
            ->assertJsonPath('data.contract.schema_version', 1)
            ->assertJsonPath('data.contract.lifecycle.kind', 'managed_registry')
            ->assertJsonPath('data.contract.execution.locations.0', 'trusted_node')
            ->assertJsonPath('data.availability.available', true)
            ->assertJsonPath('data.connector.id', $connectorId);
    }

    public function test_bundled_tools_are_opt_in_and_share_the_versioned_api_contract(): void
    {
        $this->getJson('/api/talos/tools')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/talos/tools?include_bundled=1')
            ->assertOk()
            ->assertJsonPath('data.0.contract.schema_version', 1)
            ->assertJsonPath('data.0.contract.lifecycle.kind', 'bundled')
            ->assertJsonPath('data.0.availability.available', true)
            ->assertJsonFragment(['implementation_key' => 'browser_navigate']);
    }

    public function test_planning_context_includes_every_bundled_canonical_tool_without_managed_rows(): void
    {
        $response = $this->getJson('/api/talos/tools/planning-context')
            ->assertOk();

        $tools = collect($response->json('data.tools'));
        $expectedNames = [
            'TOOL_BROWSER_NAVIGATE',
            'TOOL_BROWSER_SNAPSHOT',
            'TOOL_BROWSER_READ',
            'TOOL_BROWSER_SCREENSHOT',
            'TOOL_BROWSER_CLICK',
            'TOOL_BROWSER_FILE_UPLOAD',
            'TOOL_WEB_SEARCH',
            'TOOL_WEB_FETCH',
        ];

        $this->assertCount(count($expectedNames), $tools);
        $this->assertEqualsCanonicalizing($expectedNames, $tools->pluck('name')->all());

        $webSearch = $tools->firstWhere('name', 'TOOL_WEB_SEARCH');
        $this->assertIsArray($webSearch);
        $this->assertSame(1, $webSearch['contract']['schema_version']);
        $this->assertSame('bundled', $webSearch['contract']['lifecycle']['kind']);
        $this->assertSame(['trusted_node'], $webSearch['contract']['execution']['locations']);
        $this->assertNull($webSearch['connector']);
    }

    public function test_bundled_names_are_reserved_for_writes_and_legacy_collisions_cannot_shadow_planning(): void
    {
        $connectorId = $this->createConnector();

        $this->registryPost('/api/talos/tools', $this->toolPayload($connectorId, 'TOOL_WEB_SEARCH'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);

        \Illuminate\Support\Facades\DB::table('talos_tools')->insert([
            'id' => (string) \Illuminate\Support\Str::orderedUuid(),
            'connector_id' => $connectorId,
            'name' => 'TOOL_WEB_SEARCH',
            'display_name' => 'Shadow web search',
            'description' => 'Legacy managed row that collides with a bundled canonical node.',
            'input_schema' => json_encode(['type' => 'object'], JSON_THROW_ON_ERROR),
            'output_schema' => null,
            'risk_level' => 'low',
            'capability' => 'shadow.web.search',
            'capabilities' => json_encode(['shadow.web.search'], JSON_THROW_ON_ERROR),
            'actions' => json_encode(['read'], JSON_THROW_ON_ERROR),
            'confirmation' => 'policy',
            'effects' => json_encode([
                'mutates_state' => false,
                'parallel_safe' => true,
                'requires_approval' => false,
                'produces_evidence' => true,
            ], JSON_THROW_ON_ERROR),
            'lifecycle_kind' => 'managed_registry',
            'lifecycle_integrity_sha256' => null,
            'execution_locations' => json_encode(['trusted_node'], JSON_THROW_ON_ERROR),
            'implementation_key' => 'registry.tool_web_search',
            'schema_version' => 1,
            'contract_revision' => 1,
            'policy' => null,
            'is_enabled' => true,
            'planning_enabled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $planning = $this->getJson('/api/talos/tools/planning-context')
            ->assertOk()
            ->assertJsonFragment([
                'name' => 'TOOL_WEB_SEARCH',
                'reason' => 'bundled_name_reserved',
            ]);

        $matching = collect($planning->json('data.tools'))
            ->where('name', 'TOOL_WEB_SEARCH')
            ->values();
        $this->assertCount(1, $matching);
        $this->assertSame('bundled', $matching->first()['contract']['lifecycle']['kind']);
        $this->assertSame('web.search', $matching->first()['capability']);
    }

    public function test_canonical_contradictions_and_executable_implementation_keys_are_rejected_before_write(): void
    {
        $connectorId = $this->createConnector();

        $this->registryPost('/api/talos/tools', [
            ...$this->toolPayload($connectorId, 'UNSAFE_TOOL'),
            'risk_level' => 'critical',
            'effects' => [
                'mutates_state' => true,
                'parallel_safe' => true,
                'requires_approval' => false,
                'produces_evidence' => false,
            ],
            'execution' => [
                'locations' => ['trusted_node'],
                'implementation_key' => 'https://example.invalid/tool.js',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['contract']);

        $this->assertDatabaseMissing('talos_tools', ['name' => 'UNSAFE_TOOL']);
    }

    public function test_contract_valid_mobile_only_tool_remains_visible_but_is_not_planned(): void
    {
        $connectorId = $this->createConnector();
        $toolId = (string) \Illuminate\Support\Str::orderedUuid();
        \Illuminate\Support\Facades\DB::table('talos_tools')->insert([
            'id' => $toolId,
            'connector_id' => $connectorId,
            'name' => 'MOBILE_ONLY_TOOL',
            'display_name' => 'Mobile only tool',
            'description' => 'A bundled tool available only inside mobile.',
            'input_schema' => json_encode(['type' => 'object'], JSON_THROW_ON_ERROR),
            'output_schema' => null,
            'risk_level' => 'low',
            'capability' => 'mobile.read',
            'capabilities' => json_encode(['mobile.read'], JSON_THROW_ON_ERROR),
            'actions' => json_encode(['read'], JSON_THROW_ON_ERROR),
            'confirmation' => 'policy',
            'effects' => json_encode([
                'mutates_state' => false,
                'parallel_safe' => true,
                'requires_approval' => false,
                'produces_evidence' => true,
            ], JSON_THROW_ON_ERROR),
            'lifecycle_kind' => 'bundled',
            'lifecycle_integrity_sha256' => null,
            'execution_locations' => json_encode(['local_mobile'], JSON_THROW_ON_ERROR),
            'implementation_key' => 'mobile.only',
            'schema_version' => 1,
            'contract_revision' => 1,
            'policy' => null,
            'is_enabled' => true,
            'planning_enabled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson('/api/talos/tools?include_disabled=1')
            ->assertOk()
            ->assertJsonFragment(['id' => $toolId])
            ->assertJsonPath('data.0.availability.available', false)
            ->assertJsonPath('data.0.availability.reason', 'desktop_location_unsupported');

        $planning = $this->getJson('/api/talos/tools/planning-context')
            ->assertOk()
            ->assertJsonFragment([
                'name' => 'MOBILE_ONLY_TOOL',
                'reason' => 'desktop_location_unsupported',
            ]);
        $this->assertNotContains('MOBILE_ONLY_TOOL', array_column($planning->json('data.tools'), 'name'));
    }

    public function test_duplicate_tool_name_is_rejected(): void
    {
        $connectorId = $this->createConnector();

        $payload = $this->toolPayload($connectorId, 'HTTP_REQUEST');

        $this->registryPost('/api/talos/tools', $payload)->assertCreated();

        $this->registryPost('/api/talos/tools', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_tool_schema_is_required(): void
    {
        $connectorId = $this->createConnector();
        $payload = $this->toolPayload($connectorId, 'HTTP_REQUEST');
        unset($payload['input_schema']);

        $this->registryPost('/api/talos/tools', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['input_schema']);

        $this->getJson('/api/talos/tools')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_disabled_connector_hides_tools_from_default_list_and_planning_context(): void
    {
        $enabledConnectorId = $this->createConnector('core_http', true);
        $disabledConnectorId = $this->createConnector('private_db', false);

        $this->registryPost('/api/talos/tools', $this->toolPayload($enabledConnectorId, 'HTTP_REQUEST'))->assertCreated();
        $this->registryPost('/api/talos/tools', $this->toolPayload($disabledConnectorId, 'DATABASE_QUERY'))->assertCreated();

        $this->getJson('/api/talos/tools')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'HTTP_REQUEST');

        $this->getJson('/api/talos/tools?include_disabled=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $planning = $this->getJson('/api/talos/tools/planning-context')
            ->assertOk()
            ->assertJsonPath('data.tools.0.name', 'HTTP_REQUEST');
        $this->assertNotContains('DATABASE_QUERY', array_column($planning->json('data.tools'), 'name'));
        $planning->assertJsonFragment(['name' => 'DATABASE_QUERY', 'reason' => 'connector_disabled']);
    }

    public function test_disabled_tools_are_not_sent_to_validator_planning_context(): void
    {
        config(['services.avm_validator.url' => 'http://validator.test']);

        $connectorId = $this->createConnector('core_http', true);
        $this->registryPost('/api/talos/tools', $this->toolPayload($connectorId, 'HTTP_REQUEST'))->assertCreated();
        $this->registryPost('/api/talos/tools', [
            ...$this->toolPayload($connectorId, 'FILE_WRITE'),
            'is_enabled' => false,
        ])->assertCreated();

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Planner response',
            ]),
        ]);

        $this->postJson('/api/talos/chat', [
            'message' => 'Plan with available tools only.',
            'api_key' => 'sk-test',
        ])->assertOk();

        Http::assertSent(fn ($request): bool => $request->url() === 'http://validator.test/chat'
            && isset($request['tool_context'])
            && is_array($request['tool_context'])
            && ($request['tool_context']['tools'][0]['name'] ?? null) === 'HTTP_REQUEST'
            && ! in_array('FILE_WRITE', array_column($request['tool_context']['tools'], 'name'), true));
    }

    private function createConnector(string $key = 'core_http', bool $enabled = true): string
    {
        return (string) $this->registryPost('/api/talos/connectors', [
            'key' => $key,
            'display_name' => str_replace('_', ' ', ucfirst($key)),
            'is_enabled' => $enabled,
            'health_status' => $enabled ? 'healthy' : 'offline',
        ])
            ->assertCreated()
            ->json('data.id');
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function registryPost(string $uri, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Talos-Registry-Token', 'registry-test-token')
            ->postJson($uri, $payload);
    }

    /**
     * @return array<string, mixed>
     */
    private function toolPayload(string $connectorId, string $name): array
    {
        return [
            'connector_id' => $connectorId,
            'name' => $name,
            'display_name' => str_replace('_', ' ', ucfirst(strtolower($name))),
            'description' => "{$name} tool",
            'input_schema' => [
                'type' => 'object',
                'required' => ['input'],
                'properties' => [
                    'input' => ['type' => 'string'],
                ],
            ],
            'risk_level' => 'low',
            'capability' => strtolower(str_replace('_', '.', $name)),
            'is_enabled' => true,
            'planning_enabled' => true,
        ];
    }
}
