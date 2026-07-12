<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolExecutionContext;
use Kadmos\Tool\ToolResult;

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

function testToolDefinitionRejectsUnknownFieldsAndOpenInputSchemas(): void
{
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray([...browserNavigateDefinition(), 'internal_handler' => 'BrowserWorker']),
        'Model-visible tool definitions must reject internal handler metadata.',
    );

    $openSchema = browserNavigateDefinition();
    $openSchema['inputSchema']['additionalProperties'] = true;
    expectToolContractFailure(
        fn () => ToolDefinition::fromArray($openSchema),
        'Procedural tool input schemas must reject undeclared arguments.',
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
    $result = ToolResult::fromArray([
        'schema_version' => 'talos_tool_result_v1',
        'tool_use_id' => 'call_browser_1',
        'isError' => false,
        'content' => [
            ['type' => 'text', 'text' => 'Page inspected.'],
            ['type' => 'image', 'mimeType' => 'image/png', 'artifact_id' => 'artifact-1'],
        ],
        'structuredContent' => [
            'url' => 'https://example.com',
            'title' => 'Example Domain',
            'state_version' => 4,
            'evidence_ids' => ['artifact-1'],
        ],
        'evidence' => [[
            'artifact_id' => 'artifact-1',
            'kind' => 'screenshot',
            'sha256' => 'sha256:'.str_repeat('b', 64),
            'trusted_boundary' => 'untrusted_web_content',
        ]],
    ]);

    assertToolContract($result->toolUseId === 'call_browser_1', 'Tool result must correlate to the provider call ID.');
    assertToolContract(count($result->content) === 2, 'Tool result must preserve multiple typed content blocks.');

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
        ]),
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
        ]),
        'Unknown result fields must fail closed.',
    );
}

$tests = [
    'testMcpAlignedToolDefinitionRoundTripsWithoutShapeLoss',
    'testToolDefinitionRejectsUnknownFieldsAndOpenInputSchemas',
    'testProviderToolCallPreservesPreambleWithoutAcceptingAuthority',
    'testToolExecutionContextOwnsAvmAuthoritySeparately',
    'testMcpAlignedToolResultSupportsStructuredTextImageAndErrors',
    'testToolResultRejectsUnsupportedContentAndUnknownFields',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "ToolContractTest: OK\n";
