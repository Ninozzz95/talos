<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Browser\BrowserToolCallParser;
use Kadmos\Browser\BrowserPlanChannelResolver;
use Kadmos\Protocol\ModelPlanResponse;

function assertModelPlan(bool $condition, string $message): void
{
    if (! $condition) throw new RuntimeException($message);
}

function testBareMutationJsonNeverLeaksIntoAssistantText(): void
{
    $raw = '[{"action":"SPAWN_NODE","node_id":"browser_1","node_type":"BROWSER_COMMAND"}]';
    $response = ModelPlanResponse::parse($raw);

    assertModelPlan($response->text === '', 'A bare mutation array must not remain in assistant text.');
    assertModelPlan(($response->mutations[0]['action'] ?? null) === 'SPAWN_NODE', 'The mutation array must remain available for validation.');
}

function testFencedMutationJsonIsRemovedWithoutDroppingNaturalText(): void
{
    $raw = "I will inspect it.\n```json\n[{\"action\":\"SPAWN_NODE\",\"node_id\":\"n1\",\"node_type\":\"HTTP_REQUEST\"}]\n```\nPlease wait.";
    $response = ModelPlanResponse::parse($raw);

    assertModelPlan($response->text === "I will inspect it.\n\nPlease wait.", 'Only the fenced mutation block should be removed from assistant text.');
    assertModelPlan(count($response->mutations ?? []) === 1, 'The fenced mutation must be parsed.');
}

function testInvalidPlanLikeJsonIsSuppressedAndReportedInsteadOfLeakingAsText(): void
{
    $raw = '[This is not JSON';
    $response = ModelPlanResponse::parse($raw);

    assertModelPlan($response->text === '', 'Invalid plan-like output must not leak into assistant text.');
    assertModelPlan($response->mutations === null, 'Invalid JSON must not become a mutation plan.');
    assertModelPlan($response->parseError !== null, 'Invalid plan-like output must produce a controlled parse fault.');
}

function testTrailingRawMutationJsonIsRemovedFromNaturalText(): void
{
    $raw = "I need one page observation.\n[{\"action\":\"SPAWN_NODE\",\"node_id\":\"browser_1\",\"node_type\":\"BROWSER_COMMAND\"}]\nI will answer afterward.";
    $response = ModelPlanResponse::parse($raw);

    assertModelPlan($response->text === "I need one page observation.\n\nI will answer afterward.", 'Embedded raw JMP must be removed from assistant prose.');
    assertModelPlan(($response->mutations[0]['node_type'] ?? null) === 'BROWSER_COMMAND', 'Trailing raw JMP must remain available for validation.');
}

function testMutationPlanAfterAProseColonCannotLeak(): void
{
    $response = ModelPlanResponse::parse('Here is the plan: [{"action":"SPAWN_NODE","node_id":"browser_1","node_type":"BROWSER_COMMAND"}]');

    assertModelPlan($response->mutations !== null, 'A mutation plan after a prose colon must be parsed.');
    assertModelPlan(! str_contains($response->text, 'SPAWN_NODE'), 'A mutation plan after a prose colon must not leak into text.');
}

function testRawFunctionCallObjectIsSuppressedAsAPlanFault(): void
{
    $response = ModelPlanResponse::parse('{"name":"talos_browser_read","arguments":{"operation":"snapshot","arguments":{}}}');

    assertModelPlan($response->text === '', 'A printed function-call object must never reach assistant text.');
    assertModelPlan($response->mutations === null, 'A printed function-call object is not a valid JMP batch.');
    assertModelPlan($response->parseError !== null, 'A printed function-call object must produce a controlled plan fault.');
}

function testEmbeddedFunctionCallObjectCannotLeakBetweenNaturalText(): void
{
    $response = ModelPlanResponse::parse("Before.\n{\"operation\":\"snapshot\",\"arguments\":{}}\nAfter.");

    assertModelPlan(! str_contains($response->text, 'operation'), 'Embedded function-call JSON must be removed from assistant text.');
    assertModelPlan($response->parseError !== null, 'Embedded function-call JSON must produce a controlled plan fault.');
}

function testStructuredJsonDetectionCoversGenericFinalAnswerObjects(): void
{
    assertModelPlan(
        ModelPlanResponse::containsStructuredJson('{"title":"Observed page"}'),
        'Browser finalization must recognize generic JSON objects as structured output.',
    );
    assertModelPlan(
        ! ModelPlanResponse::containsStructuredJson('The observed title is Caradero.'),
        'Natural final-answer prose must remain plain text.',
    );
}

function testStrictBrowserParsingRejectsIncompleteToolJson(): void
{
    $response = ModelPlanResponse::parse('Call: {"name":"talos_browser_read","arguments":"unterminated"', true);

    assertModelPlan($response->text === '', 'Incomplete Browser tool JSON must not leak into final text.');
    assertModelPlan($response->parseError !== null, 'Incomplete Browser tool JSON must fail closed.');
}

function testOrdinaryJsonDataArraysRemainNaturalTextOutsideBrowserPlanning(): void
{
    $raw = 'The result is: [{"id":1,"name":"Alice"}]';
    $response = ModelPlanResponse::parse($raw);

    assertModelPlan($response->text === $raw, 'Ordinary JSON data must remain a non-Browse answer.');
    assertModelPlan($response->mutations === null, 'Ordinary JSON data must not become a JMP batch.');
    assertModelPlan($response->parseError === null, 'Valid ordinary JSON data must not produce a plan fault outside Browse.');
}

function testLiteralUnbalancedBraceDoesNotHideALaterMutationPlan(): void
{
    $response = ModelPlanResponse::parse('Note { is literal. Plan: [{"action":"YIELD_EXECUTION"}]');

    assertModelPlan($response->mutations !== null, 'A literal prose brace must not hide a later JMP batch.');
    assertModelPlan(! str_contains($response->text, 'YIELD_EXECUTION'), 'The later JMP batch must not leak into prose.');
}

function testBrowserPlanChannelsFailClosedWhenNativeAndTextPlansAreBothPresent(): void
{
    $textPlan = ModelPlanResponse::parse('[{"action":"SPAWN_NODE","node_id":"browser_1","node_type":"BROWSER_COMMAND"}]');
    $nativeCall = [[
        'id' => 'call_1',
        'type' => 'function',
        'function' => ['name' => 'talos_browser_read', 'arguments' => '{"operation":"snapshot","arguments":{}}'],
    ]];

    try {
        BrowserPlanChannelResolver::resolve($textPlan, $nativeCall);
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException('Native and text Browser plans must be rejected as ambiguous.');
}

function testBrowserPlanChannelsFailClosedWhenMalformedTextAccompaniesANativeCall(): void
{
    $malformedText = ModelPlanResponse::parse('[not valid JSON');
    $nativeCall = [[
        'id' => 'call_1',
        'type' => 'function',
        'function' => ['name' => 'talos_browser_read', 'arguments' => '{"operation":"snapshot","arguments":{}}'],
    ]];

    try {
        BrowserPlanChannelResolver::resolve($malformedText, $nativeCall);
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException('Malformed text plans must not be ignored when a native Browser call is present.');
}

function testBrowserPlanChannelsRejectProseMixedWithATextPlan(): void
{
    $mixed = ModelPlanResponse::parse("I will browse.\n[{\"action\":\"SPAWN_NODE\",\"node_id\":\"browser_1\",\"node_type\":\"BROWSER_COMMAND\"}]");

    try {
        BrowserPlanChannelResolver::resolve($mixed, []);
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException('Browser text plans mixed with prose must fail closed.');
}

function testNativeBrowserToolCallBecomesTheExistingTypedMutationPair(): void
{
    $mutations = BrowserToolCallParser::toMutations([[
        'id' => 'call_1',
        'type' => 'function',
        'function' => [
            'name' => 'talos_browser_read',
            'arguments' => json_encode([
                'operation' => 'screenshot',
                'arguments' => [],
                'expected_evidence_hash' => null,
            ], JSON_THROW_ON_ERROR),
        ],
    ]]);

    assertModelPlan(count($mutations ?? []) === 2, 'One native Browser tool call must become exactly two mutations.');
    assertModelPlan(($mutations[0]['node_type'] ?? null) === 'BROWSER_COMMAND', 'Native Browser calls must stay inside BROWSER_COMMAND.');
    assertModelPlan(($mutations[1]['payload']['operation'] ?? null) === 'screenshot', 'The requested operation must be preserved for server validation.');
}

function testNativeBrowserToolCallsFailClosedOnAmbiguousOrMalformedArguments(): void
{
    $valid = [
        'id' => 'call_1',
        'type' => 'function',
        'function' => ['name' => 'talos_browser_read', 'arguments' => '{"operation":"snapshot","arguments":{}}'],
    ];

    foreach ([[...[$valid, $valid]], [[...$valid, 'function' => ['name' => 'other_tool', 'arguments' => '{}']]], [[...$valid, 'function' => ['name' => 'talos_browser_read', 'arguments' => '{bad']]]] as $calls) {
        try {
            BrowserToolCallParser::toMutations($calls);
        } catch (InvalidArgumentException) {
            continue;
        }
        throw new RuntimeException('Ambiguous or malformed native Browser tool calls must fail closed.');
    }
}

$tests = [
    'testBareMutationJsonNeverLeaksIntoAssistantText',
    'testFencedMutationJsonIsRemovedWithoutDroppingNaturalText',
    'testInvalidPlanLikeJsonIsSuppressedAndReportedInsteadOfLeakingAsText',
    'testTrailingRawMutationJsonIsRemovedFromNaturalText',
    'testMutationPlanAfterAProseColonCannotLeak',
    'testRawFunctionCallObjectIsSuppressedAsAPlanFault',
    'testEmbeddedFunctionCallObjectCannotLeakBetweenNaturalText',
    'testStructuredJsonDetectionCoversGenericFinalAnswerObjects',
    'testStrictBrowserParsingRejectsIncompleteToolJson',
    'testOrdinaryJsonDataArraysRemainNaturalTextOutsideBrowserPlanning',
    'testLiteralUnbalancedBraceDoesNotHideALaterMutationPlan',
    'testBrowserPlanChannelsFailClosedWhenNativeAndTextPlansAreBothPresent',
    'testBrowserPlanChannelsFailClosedWhenMalformedTextAccompaniesANativeCall',
    'testBrowserPlanChannelsRejectProseMixedWithATextPlan',
    'testNativeBrowserToolCallBecomesTheExistingTypedMutationPair',
    'testNativeBrowserToolCallsFailClosedOnAmbiguousOrMalformedArguments',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed\n";
}

echo "ModelPlanResponseTest: OK\n";
