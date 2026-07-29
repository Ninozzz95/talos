<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\PromptCachePlan;

function assertPromptCachePlan(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertPromptCachePlanThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function testPromptCachePlanBuildsDeterministicOpaqueIdentity(): void
{
    $first = PromptCachePlan::forStablePrefix(
        mode: PromptCachePlan::MODE_AUTOMATIC,
        provider: 'openai',
        model: 'gpt-5.6',
        stableSystemIdentity: hash('sha256', 'private system prompt'),
        stableToolSchemaIdentity: hash('sha256', 'private tool schema'),
        stablePrefixIdentity: hash('sha256', 'private conversation prefix'),
        breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM],
        ttl: PromptCachePlan::TTL_30_MINUTES,
        minimumInputTokens: 1024,
    );
    $second = PromptCachePlan::forStablePrefix(
        mode: PromptCachePlan::MODE_AUTOMATIC,
        provider: 'openai',
        model: 'gpt-5.6',
        stableSystemIdentity: hash('sha256', 'private system prompt'),
        stableToolSchemaIdentity: hash('sha256', 'private tool schema'),
        stablePrefixIdentity: hash('sha256', 'private conversation prefix'),
        breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM],
        ttl: PromptCachePlan::TTL_30_MINUTES,
        minimumInputTokens: 1024,
    );

    assertPromptCachePlan($first->keyHash === $second->keyHash, 'Cache identity must be deterministic.');
    assertPromptCachePlan(
        preg_match('/^[a-f0-9]{64}$/', $first->keyHash) === 1,
        'Cache identity must be a lowercase SHA-256 digest.',
    );

    $audit = $first->toAuditArray();
    $encoded = json_encode($audit, JSON_THROW_ON_ERROR);
    assertPromptCachePlan(! str_contains($encoded, 'private'), 'Cache audit must not expose stable-prefix source content.');
    assertPromptCachePlan($audit === [
        'mode' => 'automatic',
        'key_hash' => $first->keyHash,
        'breakpoints' => ['system'],
        'ttl' => '30m',
        'minimum_input_tokens' => 1024,
    ], 'Cache audit shape must remain exact.');
}

function testPromptCachePlanRejectsInvalidModesKeysAndMinimums(): void
{
    $key = hash('sha256', 'cache');

    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan('optimistic', $key, [], null, null),
        'Unknown cache modes must fail closed.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(PromptCachePlan::MODE_AUTOMATIC, 'not-a-digest', [], null, null),
        'Non-digest cache keys must fail closed.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(PromptCachePlan::MODE_AUTOMATIC, $key, [], null, 0),
        'Non-positive cache minimums must fail closed.',
    );
}

function testPromptCachePlanRejectsInvalidBreakpointAndTtlCombinations(): void
{
    $key = hash('sha256', 'cache');

    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_EXPLICIT,
            $key,
            [],
            PromptCachePlan::TTL_30_MINUTES,
            1024,
        ),
        'Explicit cache mode requires at least one breakpoint.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_DISABLED,
            $key,
            [PromptCachePlan::BREAKPOINT_SYSTEM],
            null,
            null,
        ),
        'Disabled cache mode cannot carry breakpoints.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_AUTOMATIC,
            $key,
            [PromptCachePlan::BREAKPOINT_SYSTEM, PromptCachePlan::BREAKPOINT_SYSTEM],
            null,
            1024,
        ),
        'Cache breakpoints must be unique.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_AUTOMATIC,
            $key,
            ['message:not-an-index'],
            null,
            1024,
        ),
        'Malformed message breakpoints must fail closed.',
    );
    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_AUTOMATIC,
            $key,
            [],
            '24h',
            1024,
        ),
        'Unsupported cache TTLs must fail closed.',
    );
}

function testPromptCachePlanAcceptsBoundedCanonicalBreakpointVocabulary(): void
{
    $plan = new PromptCachePlan(
        PromptCachePlan::MODE_EXPLICIT,
        hash('sha256', 'cache'),
        [
            PromptCachePlan::BREAKPOINT_TOOLS,
            PromptCachePlan::BREAKPOINT_SYSTEM,
            'message:2',
            'message:4',
        ],
        PromptCachePlan::TTL_1_HOUR,
        2048,
    );

    assertPromptCachePlan(
        $plan->breakpoints === ['tools', 'system', 'message:2', 'message:4'],
        'Canonical breakpoints must retain their declared order.',
    );

    assertPromptCachePlanThrows(
        fn () => new PromptCachePlan(
            PromptCachePlan::MODE_EXPLICIT,
            hash('sha256', 'cache'),
            ['tools', 'system', 'message:0', 'message:1', 'message:2'],
            PromptCachePlan::TTL_5_MINUTES,
            512,
        ),
        'Provider cache plans must not exceed four breakpoints.',
    );
}

testPromptCachePlanBuildsDeterministicOpaqueIdentity();
testPromptCachePlanRejectsInvalidModesKeysAndMinimums();
testPromptCachePlanRejectsInvalidBreakpointAndTtlCombinations();
testPromptCachePlanAcceptsBoundedCanonicalBreakpointVocabulary();

echo "PromptCachePlanTest passed\n";
