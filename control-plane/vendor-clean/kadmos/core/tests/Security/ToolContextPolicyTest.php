<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Kadmos\Security\ToolContextPolicy;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected: ' . var_export($expected, true) . ' Actual: ' . var_export($actual, true));
    }
}

function testToolContextPolicyUsesRegistryToolsWhenPresent(): void
{
    $policy = ToolContextPolicy::fromInput([
        'tool_context' => [
            'tools' => [
                ['name' => 'HTTP_REQUEST'],
            ],
        ],
    ]);

    assertSameValue(['HTTP_REQUEST'], $policy->allowedToolNames(), 'Registry tool context should become the allowlist.');
    assertTrue($policy->isAllowed('HTTP_REQUEST'), 'Listed tool should be allowed.');
    assertTrue(! $policy->isAllowed('QUERY_DATABASE'), 'Unlisted tool should be denied.');
}

function testToolContextPolicyRejectsUnlistedSpawnNode(): void
{
    $policy = ToolContextPolicy::fromInput([
        'tool_context' => [
            'tools' => [
                ['name' => 'HTTP_REQUEST'],
            ],
        ],
    ]);

    $errors = $policy->validateMutationBatch([
        ['action' => 'SPAWN_NODE', 'node_id' => 'n1', 'node_type' => 'QUERY_DATABASE'],
    ]);

    assertSameValue(1, count($errors), 'Unlisted SPAWN_NODE type should produce one policy error.');
    assertTrue(str_contains($errors[0], 'QUERY_DATABASE'), 'Policy error should name the denied tool.');
}

function testToolContextPolicyEmptyRegistryDeniesAllTools(): void
{
    $policy = ToolContextPolicy::fromInput([
        'tool_context' => [
            'tools' => [],
        ],
    ]);

    assertSameValue([], $policy->allowedToolNames(), 'Explicit empty registry should deny all tool types.');
    assertTrue(! $policy->isAllowed('HTTP_REQUEST'), 'Explicit empty registry should deny legacy HTTP_REQUEST.');
}

function testToolContextPolicyKeepsLegacyDefaultsWhenNoRegistryWasProvided(): void
{
    $policy = ToolContextPolicy::fromInput([]);

    assertTrue($policy->isAllowed('HTTP_REQUEST'), 'Legacy direct chat should keep HTTP_REQUEST available.');
    assertTrue($policy->isAllowed('QUERY_DATABASE'), 'Legacy direct chat should keep QUERY_DATABASE available.');
}

$tests = [
    'testToolContextPolicyUsesRegistryToolsWhenPresent',
    'testToolContextPolicyRejectsUnlistedSpawnNode',
    'testToolContextPolicyEmptyRegistryDeniesAllTools',
    'testToolContextPolicyKeepsLegacyDefaultsWhenNoRegistryWasProvided',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All tool context policy tests passed" . PHP_EOL;
