<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Tools\TalosToolContractMapper;
use Kadmos\Alignment\Contract\AlignmentContractException;
use Kadmos\Alignment\Contract\ToolDefinitionV1;
use Tests\TestCase;

final class TalosToolContractMapperTest extends TestCase
{
    public function test_legacy_write_becomes_conservative_managed_trusted_node_contract(): void
    {
        $contract = TalosToolContractMapper::fromLegacyWrite([
            'connector_id' => 'connector-1',
            'name' => 'HTTP_REQUEST',
            'display_name' => 'HTTP request',
            'description' => 'Execute a policy-gated HTTP request.',
            'input_schema' => ['type' => 'object', 'properties' => []],
            'risk_level' => 'critical',
            'capability' => 'http.request',
            'is_enabled' => false,
            'planning_enabled' => false,
        ], id: 'tool-1', revision: 7)->toArray();

        $this->assertSame(1, $contract['schema_version']);
        $this->assertSame(['http.request'], $contract['capabilities']);
        $this->assertSame(['read', 'write', 'outbound'], $contract['actions']);
        $this->assertSame('always', $contract['confirmation']);
        $this->assertSame([
            'mutates_state' => true,
            'parallel_safe' => false,
            'requires_approval' => true,
            'produces_evidence' => true,
        ], $contract['effects']);
        $this->assertSame(['kind' => 'managed_registry', 'revision' => 'managed-registry:7'], $contract['lifecycle']);
        $this->assertSame(['locations' => ['trusted_node'], 'implementation_key' => 'registry.http_request'], $contract['execution']);
        $this->assertFalse($contract['enabled']);
        $this->assertFalse($contract['planning_enabled']);
    }

    public function test_write_overrides_still_pass_the_canonical_cross_field_guards(): void
    {
        $this->expectException(AlignmentContractException::class);
        $this->expectExceptionMessage('tool_parallel_mutation');

        TalosToolContractMapper::fromLegacyWrite([
            'connector_id' => 'connector-1',
            'name' => 'UNSAFE_TOOL',
            'display_name' => 'Unsafe tool',
            'description' => 'Invalid state mutation declaration.',
            'input_schema' => ['type' => 'object'],
            'risk_level' => 'critical',
            'capability' => 'unsafe.write',
            'effects' => [
                'mutates_state' => true,
                'parallel_safe' => true,
                'requires_approval' => true,
                'produces_evidence' => false,
            ],
            'execution' => [
                'locations' => ['trusted_node'],
                'implementation_key' => 'https://example.invalid/tool.js',
            ],
        ], id: 'tool-unsafe', revision: 1);
    }

    public function test_executable_url_is_rejected_as_an_implementation_key(): void
    {
        $this->expectException(AlignmentContractException::class);
        $this->expectExceptionMessage('tool_implementation_key_unsafe');

        TalosToolContractMapper::fromLegacyWrite([
            'connector_id' => 'connector-1',
            'name' => 'REMOTE_TOOL',
            'display_name' => 'Remote tool',
            'description' => 'Invalid executable URL declaration.',
            'input_schema' => ['type' => 'object'],
            'risk_level' => 'low',
            'capability' => 'remote.read',
            'execution' => [
                'locations' => ['trusted_node'],
                'implementation_key' => 'https://example.invalid/tool.js',
            ],
        ], id: 'tool-url', revision: 1);
    }

    public function test_desktop_availability_is_explicit_for_supported_and_mobile_only_contracts(): void
    {
        $supported = $this->contract([
            'lifecycle' => ['kind' => 'managed_registry', 'revision' => 'managed-registry:1'],
            'execution' => ['locations' => ['trusted_node'], 'implementation_key' => 'registry.safe_tool'],
        ]);
        $mobileOnly = $this->contract([
            'lifecycle' => ['kind' => 'bundled', 'revision' => 'mobile:1'],
            'execution' => ['locations' => ['local_mobile'], 'implementation_key' => 'mobile.safe_tool'],
        ]);

        $this->assertSame(['available' => true, 'reason' => null], TalosToolContractMapper::desktopAvailability($supported));
        $this->assertSame(
            ['available' => false, 'reason' => 'desktop_location_unsupported'],
            TalosToolContractMapper::desktopAvailability($mobileOnly),
        );
    }

    /** @param array<string, mixed> $overrides */
    private function contract(array $overrides): ToolDefinitionV1
    {
        return ToolDefinitionV1::fromArray(array_replace_recursive([
            'schema_version' => 1,
            'id' => 'safe-tool',
            'name' => 'SAFE_TOOL',
            'title' => 'Safe tool',
            'description' => 'A deterministic fixture tool.',
            'input_schema' => ['type' => 'object'],
            'output_schema' => null,
            'capabilities' => ['safe.read'],
            'actions' => ['read'],
            'confirmation' => 'policy',
            'risk' => 'low',
            'effects' => [
                'mutates_state' => false,
                'parallel_safe' => true,
                'requires_approval' => false,
                'produces_evidence' => true,
            ],
            'lifecycle' => ['kind' => 'managed_registry', 'revision' => 'managed-registry:1'],
            'execution' => ['locations' => ['trusted_node'], 'implementation_key' => 'registry.safe_tool'],
            'connector_id' => null,
            'enabled' => true,
            'planning_enabled' => true,
            'annotations' => [],
            'metadata' => [],
        ], $overrides));
    }
}
