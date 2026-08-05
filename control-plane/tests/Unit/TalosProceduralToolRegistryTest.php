<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosProceduralToolRegistry;
use Kadmos\Alignment\Contract\ToolDefinitionV1;
use Kadmos\Tool\ProceduralToolSpec;
use Kadmos\Tool\ToolDefinition;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosProceduralToolRegistryTest extends TestCase
{
    private const SUPPORTED_TOOLS = [
        'browser_navigate',
        'browser_snapshot',
        'browser_read',
        'browser_take_screenshot',
        'browser_click',
        'browser_file_upload',
        'web_search',
        'web_fetch',
    ];

    public function test_definitions_and_specs_have_exact_typed_name_parity(): void
    {
        $definitions = TalosProceduralToolRegistry::toolDefinitions();
        $specs = TalosProceduralToolRegistry::proceduralToolSpecs();

        $this->assertSame(self::SUPPORTED_TOOLS, array_keys($definitions));
        $this->assertSame(self::SUPPORTED_TOOLS, array_keys($specs));

        foreach (self::SUPPORTED_TOOLS as $toolName) {
            $this->assertInstanceOf(ToolDefinition::class, $definitions[$toolName]);
            $this->assertInstanceOf(ProceduralToolSpec::class, $specs[$toolName]);
            $this->assertSame($toolName, $definitions[$toolName]->name);
            $this->assertSame($toolName, $specs[$toolName]->toolName);
            $this->assertSame(
                $definitions[$toolName]->toArray(),
                ToolDefinition::fromStrictArray($definitions[$toolName]->toArray())->toArray(),
            );
        }

        $this->assertEquals($specs, TalosProceduralToolRegistry::registry());
    }

    public function test_registry_has_unique_node_types_and_capabilities(): void
    {
        $specs = TalosProceduralToolRegistry::proceduralToolSpecs();

        $this->assertSame(
            count($specs),
            count(array_unique(array_map(static fn (ProceduralToolSpec $spec): string => $spec->nodeType, $specs))),
        );
        $this->assertSame(
            [
                'browser_navigate' => 'TOOL_BROWSER_NAVIGATE',
                'browser_snapshot' => 'TOOL_BROWSER_SNAPSHOT',
                'browser_read' => 'TOOL_BROWSER_READ',
                'browser_take_screenshot' => 'TOOL_BROWSER_SCREENSHOT',
                'browser_click' => 'TOOL_BROWSER_CLICK',
                'browser_file_upload' => 'TOOL_BROWSER_FILE_UPLOAD',
                'web_search' => 'TOOL_WEB_SEARCH',
                'web_fetch' => 'TOOL_WEB_FETCH',
            ],
            array_map(static fn (ProceduralToolSpec $spec): string => $spec->nodeType, $specs),
        );
    }

    public function test_registry_emits_bundled_canonical_contracts_with_explicit_actions(): void
    {
        $contracts = TalosProceduralToolRegistry::contracts();

        $this->assertSame(self::SUPPORTED_TOOLS, array_keys($contracts));
        foreach ($contracts as $toolName => $contract) {
            $this->assertInstanceOf(ToolDefinitionV1::class, $contract);
            $payload = $contract->toArray();
            $this->assertSame('bundled', $payload['lifecycle']['kind']);
            $this->assertSame(['trusted_node'], $payload['execution']['locations']);
            $this->assertSame($toolName, $payload['execution']['implementation_key']);
        }

        $this->assertSame(['read'], $contracts['browser_snapshot']->toArray()['actions']);
        $this->assertSame(['write'], $contracts['browser_click']->toArray()['actions']);
        $this->assertSame(['write', 'outbound'], $contracts['browser_file_upload']->toArray()['actions']);
        $this->assertSame(['read', 'outbound'], $contracts['web_search']->toArray()['actions']);
        $this->assertSame('always', $contracts['browser_click']->toArray()['confirmation']);
    }

    public function test_all_tool_schemas_are_closed_at_every_object_boundary(): void
    {
        foreach (TalosProceduralToolRegistry::toolDefinitions() as $definition) {
            $this->assertClosedSchema($definition->inputSchema);
            if ($definition->outputSchema !== null) {
                $this->assertClosedSchema($definition->outputSchema);
            }
        }
    }

    public function test_browser_tools_match_read_only_worker_semantics(): void
    {
        $definitions = TalosProceduralToolRegistry::toolDefinitions();
        $specs = TalosProceduralToolRegistry::proceduralToolSpecs();

        $this->assertSame(['url'], $definitions['browser_navigate']->inputSchema['required']);
        $this->assertArrayNotHasKey('required', $definitions['browser_read']->inputSchema);
        $this->assertSame(
            ['ref', 'query'],
            array_keys($definitions['browser_read']->inputSchema['properties']),
        );
        foreach (['browser_navigate', 'browser_snapshot', 'browser_read', 'browser_take_screenshot'] as $toolName) {
            foreach (['state_version', 'snapshot_id', 'waitUntil', 'timeoutMs'] as $serverOwned) {
                $this->assertArrayNotHasKey($serverOwned, $definitions[$toolName]->inputSchema['properties']);
            }
        }
        $this->assertSame(['image/png'], [$definitions['browser_take_screenshot']->outputSchema['properties']['mime_type']['const']]);
        $this->assertFalse($definitions['browser_navigate']->annotations['readOnlyHint']);
        $this->assertTrue($definitions['browser_navigate']->annotations['openWorldHint']);
        foreach (['browser_snapshot', 'browser_read', 'browser_take_screenshot'] as $toolName) {
            $this->assertTrue($definitions[$toolName]->annotations['readOnlyHint']);
            $this->assertFalse($definitions[$toolName]->annotations['openWorldHint']);
        }

        $this->assertTrue($specs['browser_navigate']->mutatesState);
        $this->assertFalse($specs['browser_navigate']->parallelSafe);
        $this->assertTrue($specs['browser_navigate']->producesEvidence);

        foreach (['browser_snapshot', 'browser_read', 'browser_take_screenshot'] as $toolName) {
            $this->assertFalse($specs[$toolName]->mutatesState);
            $this->assertTrue($specs[$toolName]->parallelSafe);
            $this->assertTrue($specs[$toolName]->producesEvidence);
            $this->assertSame('browser.read', $specs[$toolName]->capability);
            $this->assertSame('low', $specs[$toolName]->risk);
            $this->assertFalse($specs[$toolName]->requiresApproval);
        }

        $click = $definitions['browser_click'];
        $this->assertSame(['target'], $click->inputSchema['required']);
        $this->assertSame(['target', 'element'], array_keys($click->inputSchema['properties']));
        $this->assertSame('^r[0-9]+$', $click->inputSchema['properties']['target']['pattern']);
        foreach (['state_version', 'snapshot_id', 'selector', 'normalized_x', 'normalized_y'] as $serverOwned) {
            $this->assertArrayNotHasKey($serverOwned, $click->inputSchema['properties']);
        }
        $this->assertFalse($click->annotations['readOnlyHint']);
        $this->assertFalse($click->annotations['destructiveHint']);
        $this->assertFalse($click->annotations['idempotentHint']);
        $this->assertFalse($click->annotations['openWorldHint']);
        $this->assertSame('browser.write', $specs['browser_click']->capability);
        $this->assertSame('high', $specs['browser_click']->risk);
        $this->assertTrue($specs['browser_click']->requiresApproval);
        $this->assertTrue($specs['browser_click']->mutatesState);
        $this->assertFalse($specs['browser_click']->parallelSafe);
        $this->assertTrue($specs['browser_click']->producesEvidence);

        $upload = $definitions['browser_file_upload'];
        $this->assertSame(['target', 'file_ids'], $upload->inputSchema['required']);
        $this->assertSame(['target', 'element', 'file_ids'], array_keys($upload->inputSchema['properties']));
        $this->assertSame('^r[0-9]+$', $upload->inputSchema['properties']['target']['pattern']);
        $this->assertSame('uuid', $upload->inputSchema['properties']['file_ids']['items']['format']);
        $this->assertSame(1, $upload->inputSchema['properties']['file_ids']['minItems']);
        $this->assertSame(4, $upload->inputSchema['properties']['file_ids']['maxItems']);
        $this->assertTrue($upload->inputSchema['properties']['file_ids']['uniqueItems']);
        foreach (['state_version', 'snapshot_id', 'staged_file_ids', 'path', 'base64'] as $serverOwned) {
            $this->assertArrayNotHasKey($serverOwned, $upload->inputSchema['properties']);
        }
        $this->assertFalse($upload->annotations['readOnlyHint']);
        $this->assertFalse($upload->annotations['destructiveHint']);
        $this->assertFalse($upload->annotations['idempotentHint']);
        $this->assertFalse($upload->annotations['openWorldHint']);
        $this->assertSame('browser.upload', $specs['browser_file_upload']->capability);
        $this->assertSame('critical', $specs['browser_file_upload']->risk);
        $this->assertTrue($specs['browser_file_upload']->requiresApproval);
        $this->assertTrue($specs['browser_file_upload']->mutatesState);
        $this->assertFalse($specs['browser_file_upload']->parallelSafe);
        $this->assertTrue($specs['browser_file_upload']->producesEvidence);
    }

    public function test_web_tools_match_bounded_laravel_contracts_and_untrusted_evidence(): void
    {
        $definitions = TalosProceduralToolRegistry::toolDefinitions();
        $specs = TalosProceduralToolRegistry::proceduralToolSpecs();

        $searchInput = $definitions['web_search']->inputSchema;
        $this->assertSame(['query'], $searchInput['required']);
        $this->assertSame(512, $searchInput['properties']['query']['maxLength']);
        $this->assertSame(['language', 'pageno', 'time_range', 'safesearch'], array_keys($searchInput['properties']['options']['properties']));
        $this->assertSame(['day', 'month', 'year', null], $searchInput['properties']['options']['properties']['time_range']['enum']);

        $fetchInput = $definitions['web_fetch']->inputSchema;
        $this->assertSame(['url'], $fetchInput['required']);
        $this->assertSame(15000, $fetchInput['properties']['timeout_ms']['maximum']);
        $this->assertSame(10000000, $fetchInput['properties']['max_bytes']['maximum']);
        $this->assertSame(10, $fetchInput['properties']['max_redirects']['maximum']);

        $searchOutput = $definitions['web_search']->outputSchema;
        $this->assertSame('untrusted_web_search', $searchOutput['properties']['provenance']['const']);
        $this->assertSame('untrusted', $searchOutput['properties']['results']['items']['properties']['provenance']['const']);
        $this->assertTrue($searchOutput['properties']['results']['items']['properties']['untrusted']['const']);

        $fetchOutput = $definitions['web_fetch']->outputSchema;
        $this->assertSame('untrusted_web_fetch', $fetchOutput['properties']['provenance']['const']);
        $this->assertTrue($fetchOutput['properties']['untrusted']['const']);
        $this->assertTrue($definitions['web_search']->annotations['readOnlyHint']);
        $this->assertTrue($definitions['web_search']->annotations['openWorldHint']);
        $this->assertTrue($definitions['web_fetch']->annotations['readOnlyHint']);
        $this->assertTrue($definitions['web_fetch']->annotations['openWorldHint']);

        foreach (['web_search', 'web_fetch'] as $toolName) {
            $this->assertSame('low', $specs[$toolName]->risk);
            $this->assertSame('web.'.substr($toolName, 4), $specs[$toolName]->capability);
            $this->assertFalse($specs[$toolName]->mutatesState);
            $this->assertTrue($specs[$toolName]->parallelSafe);
            $this->assertTrue($specs[$toolName]->producesEvidence);
        }
    }

    public function test_unknown_tool_lookup_fails_closed(): void
    {
        $this->expectException(InvalidArgumentException::class);
        TalosProceduralToolRegistry::definition('browser_evaluate');
    }

    /** @param array<string, mixed> $schema */
    private function assertClosedSchema(array $schema): void
    {
        if (($schema['type'] ?? null) === 'object') {
            $this->assertFalse($schema['additionalProperties'] ?? true);
            foreach (($schema['properties'] ?? []) as $property) {
                if (is_array($property)) {
                    $this->assertClosedSchema($property);
                }
            }
        }

        foreach (['items', 'contains', 'not'] as $key) {
            if (is_array($schema[$key] ?? null)) {
                $this->assertClosedSchema($schema[$key]);
            }
        }
        foreach (['anyOf', 'allOf', 'oneOf'] as $key) {
            foreach (($schema[$key] ?? []) as $branch) {
                if (is_array($branch)) {
                    $this->assertClosedSchema($branch);
                }
            }
        }
    }
}
