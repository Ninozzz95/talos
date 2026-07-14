<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolExecutionContext;
use Kadmos\Tool\ToolResult;
use Mcp\Schema\Tool as McpTool;
use Mcp\Schema\Result\CallToolResult as McpCallToolResult;

/** @return array<string, mixed>|list<mixed> */
function toolContractFixture(string $name): array
{
    $path = __DIR__.'/fixtures/tool-contracts/'.$name.'.json';
    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new RuntimeException("Unable to read tool contract fixture: {$name}");
    }

    $decoded = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
    if (! is_array($decoded)) {
        throw new RuntimeException("Tool contract fixture must decode to an array: {$name}");
    }

    return $decoded;
}

function assertToolContract(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function expectToolContractFailure(callable $operation, string $message): void
{
    try {
        $operation();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function browserNavigateDefinition(): array
{
    return [
        'name' => 'browser_navigate',
        'title' => 'Navigate',
        'description' => 'Navigate the isolated Browser page.',
        'inputSchema' => [
            'type' => 'object',
            'properties' => ['url' => ['type' => 'string', 'format' => 'uri']],
            'required' => ['url'],
            'additionalProperties' => false,
        ],
        'outputSchema' => [
            'type' => 'object',
            'properties' => [
                'url' => ['type' => 'string'],
                'title' => ['type' => 'string'],
                'state_version' => ['type' => 'integer'],
            ],
            'required' => ['url', 'title', 'state_version'],
            'additionalProperties' => false,
        ],
        'annotations' => [
            'readOnlyHint' => false,
            'destructiveHint' => false,
            'idempotentHint' => false,
            'openWorldHint' => true,
        ],
    ];
}

function testMcpAlignedToolDefinitionRoundTripsWithoutShapeLoss(): void
{
    $raw = browserNavigateDefinition();
    $definition = ToolDefinition::fromArray($raw);

    assertToolContract($definition->toArray() === $raw, 'MCP-aligned tool definitions must round-trip exactly.');
}

function testToolDefinitionSeparatesMcpCompatibilityFromStrictProceduralPolicy(): void
{
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray([...browserNavigateDefinition(), 'internal_handler' => 'BrowserWorker']),
        'Model-visible tool definitions must reject internal handler metadata.',
    );

    $openSchema = browserNavigateDefinition();
    $openSchema['inputSchema']['additionalProperties'] = true;
    assertToolContract(
        ToolDefinition::fromArray($openSchema)->toArray() === $openSchema,
        'The generic MCP contract must preserve valid open JSON Schemas.',
    );
    expectToolContractFailure(
        fn () => ToolDefinition::fromStrictArray($openSchema),
        'Procedural tool input schemas must reject undeclared arguments.',
    );

    $composedSchema = browserNavigateDefinition();
    $composedSchema['inputSchema'] = [
        'type' => 'object',
        'required' => ['resolved_by_composition'],
        'additionalProperties' => false,
    ];
    assertToolContract(
        ToolDefinition::fromArray($composedSchema)->toArray() === $composedSchema,
        'Generic MCP definitions must preserve JSON Schema composition semantics.',
    );
    expectToolContractFailure(
        fn () => ToolDefinition::fromStrictArray($composedSchema),
        'Strict procedural schemas must declare every required argument locally.',
    );
}

function testOfficialMcpSdkAcceptsThePinnedDefinitionFixture(): void
{
    assertToolContract(class_exists(McpTool::class), 'The pinned official MCP PHP SDK must be installed.');

    $fixture = toolContractFixture('valid-definition');
    $sdkDefinition = McpTool::fromArray($fixture);
    $serialized = json_decode(json_encode($sdkDefinition, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);

    assertToolContract(is_array($serialized) && $serialized == $fixture, 'The official MCP SDK and TALOS must agree on the definition fixture.');
}

function testMcp20251125OptionalToolMetadataRoundTrips(): void
{
    $fixture = toolContractFixture('valid-definition-2025-11-25');
    $definition = ToolDefinition::fromStrictArray($fixture);

    assertToolContract($definition->toArray() === $fixture, 'MCP 2025-11-25 optional Tool metadata must round-trip exactly.');
    assertToolContract($definition->description === null, 'MCP Tool descriptions must remain optional.');
    assertToolContract(($definition->icons[0]['theme'] ?? null) === 'dark', 'MCP Icon theme must round-trip.');

    expectToolContractFailure(
        fn () => ToolDefinition::fromArray([...$fixture, 'title' => null]),
        'Explicit null is not a valid MCP Tool title.',
    );
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray([...$fixture, 'name' => 'browser_snapshot-']),
        'MCP Tool names must end in an alphanumeric character.',
    );
}

function testOfficialMcpSdkAcceptsItsSupportedResultContentSubset(): void
{
    $fixture = toolContractFixture('valid-result');
    $sdkContent = array_values(array_filter(
        $fixture['content'],
        static fn (array $block): bool => ($block['type'] ?? null) !== 'resource_link',
    ));
    $sdkResult = McpCallToolResult::fromArray([
        'content' => $sdkContent,
        'isError' => $fixture['isError'],
        'structuredContent' => $fixture['structuredContent'],
    ]);
    $serialized = json_decode(json_encode($sdkResult, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);

    assertToolContract(($serialized['content'] ?? null) == $sdkContent, 'The official MCP SDK and TALOS must agree on supported content blocks.');
    assertToolContract(($serialized['structuredContent'] ?? null) == $fixture['structuredContent'], 'The official MCP SDK and TALOS must agree on structuredContent.');
}

function testMcpDependencyInstallIsNonInteractiveAndFailClosed(): void
{
    $composer = json_decode((string) file_get_contents(__DIR__.'/../composer.json'), true, flags: JSON_THROW_ON_ERROR);

    assertToolContract(
        ($composer['config']['allow-plugins']['php-http/discovery'] ?? null) === false,
        'The transitive discovery plugin must be explicitly disabled until TALOS requires its Composer hook.',
    );
}

function testProviderToolCallPreservesPreambleWithoutAcceptingAuthority(): void
{
    $call = ToolCall::fromArray([
        'schema_version' => 'talos_provider_tool_call_v1',
        'provider_call_id' => 'call_browser_1',
        'name' => 'browser_navigate',
        'arguments' => ['url' => 'https://example.com'],
        'assistant_preamble' => 'I will inspect the page.',
        'provider_metadata' => [
            'adapter' => 'openai_chat_v1',
            'response_id' => null,
            'stop_reason' => 'tool_calls',
        ],
    ]);

    assertToolContract($call->assistantPreamble === 'I will inspect the page.', 'Provider preamble must survive normalization.');
    assertToolContract($call->arguments === ['url' => 'https://example.com'], 'Tool arguments must remain structured.');

    expectToolContractFailure(
        fn () => ToolCall::fromArray([
            ...$call->toArray(),
            'run_id' => 'model-owned-run',
        ]),
        'Provider calls must reject model-authored run authority.',
    );
}

function testToolExecutionContextOwnsAvmAuthoritySeparately(): void
{
    $context = new ToolExecutionContext(
        userId: 'user-1',
        chatSessionId: 'chat-1',
        runId: 'run-1',
        turnId: 'turn-1',
        browserSessionId: 'browser-1',
        nodeId: 'tool-node-1',
        capability: 'browser.read',
        risk: 'read',
        stateVersion: 3,
        deadlineAt: '2026-07-12T20:00:00Z',
        idempotencyKey: 'sha256:'.str_repeat('a', 64),
    );

    assertToolContract($context->runId === 'run-1', 'AVM authority must be server-owned and typed.');
    assertToolContract(! array_key_exists('run_id', ToolCall::allowedKeys()), 'Model tool-call keys must exclude AVM run authority.');
}

function testMcpAlignedToolResultSupportsStructuredTextImageAndErrors(): void
{
    $result = ToolResult::fromArray(toolContractFixture('valid-result'), expectedToolUseId: 'call_browser_1');

    assertToolContract($result->toolUseId === 'call_browser_1', 'Tool result must correlate to the provider call ID.');
    assertToolContract(count($result->content) === 5, 'Tool result must preserve the standard MCP content union.');

    $error = ToolResult::error('call_browser_2', 'STALE_BROWSER_REF', 'The Browser reference is stale.');
    assertToolContract($error->isError, 'Recoverable tool failures must be represented as MCP error results.');
    assertToolContract(($error->structuredContent['code'] ?? null) === 'STALE_BROWSER_REF', 'Tool error code must remain machine-readable.');
}

function testToolResultRejectsUnsupportedContentAndUnknownFields(): void
{
    expectToolContractFailure(
        fn () => ToolResult::fromArray([
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [['type' => 'video', 'url' => 'https://example.com/video.mp4']],
            'structuredContent' => null,
            'evidence' => [],
        ], expectedToolUseId: 'call-1'),
        'Unsupported content blocks must fail closed.',
    );

    expectToolContractFailure(
        fn () => ToolResult::fromArray([
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => [],
            'structuredContent' => null,
            'evidence' => [],
            'secret' => 'must-not-pass',
        ], expectedToolUseId: 'call-1'),
        'Unknown result fields must fail closed.',
    );
}

function testToolContractCollectionsAreBounded(): void
{
    $definition = browserNavigateDefinition();
    $definition['inputSchema']['properties'] = [];
    $definition['inputSchema']['required'] = [];
    for ($index = 0; $index < 257; $index++) {
        $field = 'field_'.$index;
        $definition['inputSchema']['properties'][$field] = ['type' => 'string'];
        $definition['inputSchema']['required'][] = $field;
    }
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray($definition),
        'Tool JSON Schema required fields must be bounded.',
    );

    $result = toolContractFixture('valid-result');
    $result['content'] = array_fill(0, 65, ['type' => 'text', 'text' => 'bounded']);
    expectToolContractFailure(
        fn () => ToolResult::fromArray($result, expectedToolUseId: 'call_browser_1'),
        'Tool result content blocks must be bounded.',
    );

    $result = toolContractFixture('valid-result');
    $result['evidence'] = [];
    for ($index = 0; $index < 129; $index++) {
        $result['evidence'][] = [
            'artifact_id' => 'artifact-'.$index,
            'kind' => 'snapshot',
            'sha256' => 'sha256:'.str_repeat(dechex($index % 16), 64),
            'trusted_boundary' => 'untrusted_web_content',
        ];
    }
    expectToolContractFailure(
        fn () => ToolResult::fromArray($result, expectedToolUseId: 'call_browser_1'),
        'Tool result evidence records must be bounded.',
    );
}

function testCrossRuntimeContractEdgeRules(): void
{
    $call = toolContractFixture('valid-call');
    $call['arguments'] = [];
    $call['provider_metadata'] = [];
    $toolCall = ToolCall::fromArray($call);
    assertToolContract($toolCall->toArray() === $call, 'PHP contract arrays must remain stable across internal reparsing.');
    $serializedCall = json_encode($toolCall, JSON_THROW_ON_ERROR);
    assertToolContract(str_contains($serializedCall, '"arguments":{}'), 'Empty PHP object aliases must serialize canonically as JSON objects.');
    assertToolContract(str_contains($serializedCall, '"provider_metadata":{}'), 'Empty provider metadata must serialize canonically as a JSON object.');

    $context = toolContractFixture('valid-context');
    $context['deadline_at'] = '2026-07-12T20:00:00';
    expectToolContractFailure(
        fn () => ToolExecutionContext::fromArray($context),
        'Tool deadlines must include an explicit UTC or numeric offset.',
    );

    $context = toolContractFixture('valid-context');
    $context['state_version'] = 9007199254740992;
    expectToolContractFailure(
        fn () => ToolExecutionContext::fromArray($context),
        'Tool state versions must remain JSON-safe across PHP and JavaScript.',
    );

    $context = toolContractFixture('valid-context');
    $context['state_version'] = 1.0;
    assertToolContract(
        ToolExecutionContext::fromArray($context)->stateVersion === 1,
        'Integral JSON 1.0 values must be accepted as integers by PHP.',
    );

    $decimalContext = ToolExecutionContext::fromArray(toolContractFixture('valid-context-json-number'));
    assertToolContract($decimalContext->stateVersion === 1, 'Shared JSON 1.0 fixture must normalize to integer state.');

    $iconDefinition = browserNavigateDefinition();
    $iconDefinition['icons'] = [
        ['src' => 'http://example.com/talos.png'],
        ['src' => 'data:image/png;base64,iVBORw0KGgo='],
    ];
    ToolDefinition::fromArray($iconDefinition);

    $definition = browserNavigateDefinition();
    $definition['description'] = str_repeat('é', 2049);
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray($definition),
        'Tool string bounds must be measured as UTF-8 bytes in both runtimes.',
    );

    $result = toolContractFixture('valid-result');
    $result['content'][0]['annotations'] = null;
    expectToolContractFailure(
        fn () => ToolResult::fromArray($result, expectedToolUseId: 'call_browser_1'),
        'Explicit null optional content metadata must fail consistently.',
    );

    $result = toolContractFixture('valid-result');
    $result['content'][3]['title'] = 'Current browser screenshot';
    $roundTrip = ToolResult::fromArray($result, expectedToolUseId: 'call_browser_1')->toArray();
    assertToolContract($roundTrip === $result, 'MCP resource-link titles must round-trip.');
}

function testCanonicalizesNestedSchemaPropertiesOnWire(): void
{
    $definition = browserNavigateDefinition();
    $definition['inputSchema']['properties'] = [];
    $parsed = ToolDefinition::fromArray($definition);

    assertToolContract(
        ($parsed->toWireArray()['inputSchema']['properties'] ?? null) instanceof stdClass,
        'Empty nested schema properties must serialize as a canonical object.',
    );
}

function testWireJsonRejectsObjectsAndListsInTheWrongPositions(): void
{
    assertToolContract(method_exists(ToolDefinition::class, 'fromJson'), 'Tool definitions need a shape-preserving wire decoder.');
    assertToolContract(method_exists(ToolCall::class, 'fromJson'), 'Tool calls need a shape-preserving wire decoder.');
    assertToolContract(method_exists(ToolExecutionContext::class, 'fromJson'), 'Tool contexts need a shape-preserving wire decoder.');
    assertToolContract(method_exists(ToolResult::class, 'fromJson'), 'Tool results need a shape-preserving wire decoder.');

    $validResultJson = (string) file_get_contents(__DIR__.'/fixtures/tool-contracts/valid-result.json');
    assertToolContract(
        ToolResult::fromJson($validResultJson, expectedToolUseId: 'call_browser_1')->toolUseId === 'call_browser_1',
        'Canonical result JSON must pass the shape-preserving boundary.',
    );

    expectToolContractFailure(
        fn () => ToolResult::fromJson(json_encode([
            'schema_version' => 'talos_tool_result_v1',
            'tool_use_id' => 'call-1',
            'isError' => false,
            'content' => new stdClass(),
            'structuredContent' => null,
            'evidence' => [],
        ], JSON_THROW_ON_ERROR), expectedToolUseId: 'call-1'),
        'A wire object must never be accepted where result content requires a list.',
    );

    expectToolContractFailure(
        fn () => ToolDefinition::fromJson(json_encode([
            'name' => 'browser_snapshot',
            'inputSchema' => ['type' => 'object', 'additionalProperties' => false],
            'icons' => new stdClass(),
        ], JSON_THROW_ON_ERROR)),
        'A wire object must never be accepted where definition icons require a list.',
    );

    $validCall = toolContractFixture('valid-call');
    $validCall['arguments'] = [];
    expectToolContractFailure(
        fn () => ToolCall::fromJson(json_encode($validCall, JSON_THROW_ON_ERROR)),
        'A wire list must never be accepted where tool arguments require an object.',
    );

    expectToolContractFailure(
        fn () => ToolExecutionContext::fromJson('[]'),
        'Canonical tool context JSON must have an object root.',
    );
}

function testMcpResourceLinksAcceptOpaqueAbsoluteUris(): void
{
    $result = ToolResult::fromArray([
        'schema_version' => 'talos_tool_result_v1',
        'tool_use_id' => 'call-urn',
        'isError' => false,
        'content' => [[
            'type' => 'resource_link',
            'uri' => 'urn:example:artifact:42',
            'name' => 'Opaque artifact reference',
        ]],
        'structuredContent' => null,
        'evidence' => [],
    ], expectedToolUseId: 'call-urn');

    assertToolContract($result->content[0]['uri'] === 'urn:example:artifact:42', 'MCP resources may use non-hierarchical absolute URIs.');
}

function testVersionedToolContractFixturesRoundTrip(): void
{
    $definition = toolContractFixture('valid-definition');
    $call = toolContractFixture('valid-call');
    $context = toolContractFixture('valid-context');
    $result = toolContractFixture('valid-result');

    assertToolContract(ToolDefinition::fromStrictArray($definition)->toArray() === $definition, 'Definition fixture must round-trip.');
    assertToolContract(ToolCall::fromArray($call)->toArray() === $call, 'Call fixture must round-trip.');
    assertToolContract(ToolExecutionContext::fromArray($context)->toArray() === $context, 'Context fixture must round-trip.');
    assertToolContract(ToolResult::fromArray($result, expectedToolUseId: 'call_browser_1')->toArray() === $result, 'Result fixture must round-trip.');
}

function testInvalidToolContractFixturesFailClosed(): void
{
    $cases = toolContractFixture('invalid-contracts');

    foreach ($cases as $case) {
        assertToolContract(is_array($case), 'Invalid contract case must be an object.');
        $contract = $case['contract'] ?? null;
        $payload = $case['payload'] ?? null;
        assertToolContract(is_string($contract) && is_array($payload), 'Invalid contract fixture is malformed.');

        expectToolContractFailure(
            static function () use ($contract, $payload, $case): void {
                match ($contract) {
                    'definition' => ToolDefinition::fromArray($payload),
                    'strict_definition' => ToolDefinition::fromStrictArray($payload),
                    'call' => ToolCall::fromArray($payload),
                    'context' => ToolExecutionContext::fromArray($payload),
                    'result' => ToolResult::fromArray(
                        $payload,
                        isset($case['expected_tool_use_id']) && is_string($case['expected_tool_use_id'])
                            ? $case['expected_tool_use_id']
                            : (is_string($payload['tool_use_id'] ?? null) && $payload['tool_use_id'] !== ''
                                ? $payload['tool_use_id']
                                : 'expected-call-id'),
                    ),
                    default => throw new RuntimeException("Unknown fixture contract: {$contract}"),
                };
            },
            sprintf('Invalid fixture must fail closed: %s', (string) ($case['label'] ?? 'unknown')),
        );
    }
}

function testToolCallRedactedSerializationProtectsSecretsWithoutHidingBudgets(): void
{
    $payload = toolContractFixture('valid-call');
    $payload['arguments']['api_key'] = 'provider-secret';
    $payload['arguments']['apiKey'] = 'provider-secret-camel';
    $payload['arguments']['max_tokens'] = 4096;
    $payload['arguments']['url'] = 'https://example.com/path?token=provider-secret&safe=visible';
    $payload['arguments']['redirect_url'] = 'https://example.com/callback#access_token=provider-secret&safe=visible';
    $payload['provider_metadata']['nested'] = [
        'authorization' => 'Bearer provider-secret',
        'message' => 'Provider returned Bearer provider-secret in diagnostics.',
        'clientSecret' => 'provider-secret-camel',
        'safe_value' => 'visible',
    ];

    $redacted = ToolCall::fromArray($payload)->toRedactedArray();

    assertToolContract(($redacted['arguments']['api_key'] ?? null) === '[REDACTED]', 'API keys must be redacted.');
    assertToolContract(($redacted['arguments']['apiKey'] ?? null) === '[REDACTED]', 'Camel-case API keys must be redacted.');
    assertToolContract(($redacted['arguments']['max_tokens'] ?? null) === 4096, 'Token budgets are not credentials.');
    assertToolContract(($redacted['arguments']['url'] ?? null) === 'https://example.com/path?token=%5BREDACTED%5D&safe=visible', 'Sensitive URL query values must be redacted.');
    assertToolContract(($redacted['arguments']['redirect_url'] ?? null) === 'https://example.com/callback#access_token=%5BREDACTED%5D&safe=visible', 'Sensitive URL fragment values must be redacted.');
    assertToolContract(($redacted['provider_metadata']['nested']['authorization'] ?? null) === '[REDACTED]', 'Nested authorization must be redacted.');
    assertToolContract(($redacted['provider_metadata']['nested']['message'] ?? null) === 'Provider returned Bearer [REDACTED] in diagnostics.', 'Bearer values in diagnostics must be redacted.');
    assertToolContract(($redacted['provider_metadata']['nested']['clientSecret'] ?? null) === '[REDACTED]', 'Camel-case client secrets must be redacted.');
    assertToolContract(($redacted['provider_metadata']['nested']['safe_value'] ?? null) === 'visible', 'Safe metadata must remain inspectable.');
}

$tests = [
    'testMcpAlignedToolDefinitionRoundTripsWithoutShapeLoss',
    'testToolDefinitionSeparatesMcpCompatibilityFromStrictProceduralPolicy',
    'testOfficialMcpSdkAcceptsThePinnedDefinitionFixture',
    'testMcp20251125OptionalToolMetadataRoundTrips',
    'testOfficialMcpSdkAcceptsItsSupportedResultContentSubset',
    'testMcpDependencyInstallIsNonInteractiveAndFailClosed',
    'testProviderToolCallPreservesPreambleWithoutAcceptingAuthority',
    'testToolExecutionContextOwnsAvmAuthoritySeparately',
    'testMcpAlignedToolResultSupportsStructuredTextImageAndErrors',
    'testToolResultRejectsUnsupportedContentAndUnknownFields',
    'testToolContractCollectionsAreBounded',
    'testCrossRuntimeContractEdgeRules',
    'testCanonicalizesNestedSchemaPropertiesOnWire',
    'testWireJsonRejectsObjectsAndListsInTheWrongPositions',
    'testMcpResourceLinksAcceptOpaqueAbsoluteUris',
    'testVersionedToolContractFixturesRoundTrip',
    'testInvalidToolContractFixturesFailClosed',
    'testToolCallRedactedSerializationProtectsSecretsWithoutHidingBudgets',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All tool contract tests passed\n";
