<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\ProviderTurnRequest;

function assertProviderTurnRequest(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertProviderTurnRequestThrows(callable $fn, string $message): void
{
    try {
        $fn();
    } catch (\InvalidArgumentException $e) {
        return;
    }
    throw new RuntimeException($message);
}

function durableUserMessage(): array
{
    return [['role' => 'user', 'content' => 'hi']];
}

/**
 * The reasoning fields are optional and default to null so existing positional
 * callers keep working unchanged.
 */
function testReasoningFieldsDefaultToNull(): void
{
    $request = new ProviderTurnRequest('openai', 'gpt-4', 'sys', durableUserMessage(), []);

    assertProviderTurnRequest($request->reasoningEffort === null, 'reasoningEffort defaults to null');
    assertProviderTurnRequest($request->reasoningVisible === null, 'reasoningVisible defaults to null');

    $redacted = $request->toRedactedArray();
    assertProviderTurnRequest(array_key_exists('reasoning_effort', $redacted), 'toRedactedArray exposes reasoning_effort');
    assertProviderTurnRequest($redacted['reasoning_effort'] === null, 'default reasoning_effort is null');
    assertProviderTurnRequest(array_key_exists('reasoning_visible', $redacted), 'toRedactedArray exposes reasoning_visible');
    assertProviderTurnRequest($redacted['reasoning_visible'] === null, 'default reasoning_visible is null');
}

/**
 * The reasoning fields must be stored and carried into the redacted array, which
 * feeds the gateway idempotency hash — otherwise the fence would not cover them.
 */
function testReasoningFieldsCarryThroughRedactedArray(): void
{
    $request = new ProviderTurnRequest('anthropic', 'claude', 'sys', durableUserMessage(), [], 8000, null, [], 'high', true);

    assertProviderTurnRequest($request->reasoningEffort === 'high', 'reasoningEffort is stored');
    assertProviderTurnRequest($request->reasoningVisible === true, 'reasoningVisible is stored');

    $redacted = $request->toRedactedArray();
    assertProviderTurnRequest($redacted['reasoning_effort'] === 'high', 'reasoning_effort in redacted array (idempotency hash coverage)');
    assertProviderTurnRequest($redacted['reasoning_visible'] === true, 'reasoning_visible in redacted array');
}

/**
 * An empty or over-long effort string is rejected fail-closed.
 */
function testReasoningEffortRejectsEmptyAndOverlong(): void
{
    assertProviderTurnRequestThrows(
        fn () => new ProviderTurnRequest('openai', 'gpt-4', 'sys', durableUserMessage(), [], null, null, [], '', null),
        'empty reasoningEffort must throw',
    );
    assertProviderTurnRequestThrows(
        fn () => new ProviderTurnRequest('openai', 'gpt-4', 'sys', durableUserMessage(), [], null, null, [], str_repeat('x', 17), null),
        'over-long reasoningEffort (>16) must throw',
    );
}

testReasoningFieldsDefaultToNull();
testReasoningFieldsCarryThroughRedactedArray();
testReasoningEffortRejectsEmptyAndOverlong();

echo "ProviderTurnRequestTest passed\n";
