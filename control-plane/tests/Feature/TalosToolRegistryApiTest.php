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
            ->assertJsonPath('data.connector.id', $connectorId);
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

        $this->getJson('/api/talos/tools/planning-context')
            ->assertOk()
            ->assertJsonPath('data.tools.0.name', 'HTTP_REQUEST')
            ->assertJsonMissing(['DATABASE_QUERY']);
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
            && ! str_contains(json_encode($request['tool_context'], JSON_THROW_ON_ERROR), 'FILE_WRITE'));
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
