<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Provider\PromptCachePlan;

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

function testResponseMimeTypeDefaultsToNullAndIsAudited(): void
{
    $default = new ProviderTurnRequest('openai', 'gpt-4', 'sys', durableUserMessage(), []);
    assertProviderTurnRequest($default->responseMimeType === null, 'responseMimeType defaults to null');
    assertProviderTurnRequest(
        array_key_exists('response_mime_type', $default->toRedactedArray()),
        'toRedactedArray exposes response_mime_type',
    );
    assertProviderTurnRequest(
        $default->toRedactedArray()['response_mime_type'] === null,
        'default response_mime_type is null',
    );

    $json = new ProviderTurnRequest(
        provider: 'deepseek',
        model: 'deepseek-chat',
        systemPrompt: 'Return JSON.',
        messages: durableUserMessage(),
        tools: [],
        responseMimeType: 'application/json',
    );
    assertProviderTurnRequest($json->responseMimeType === 'application/json', 'JSON response MIME is stored');
    assertProviderTurnRequest(
        $json->toRedactedArray()['response_mime_type'] === 'application/json',
        'response_mime_type participates in the audited idempotency payload',
    );
}

function testResponseMimeTypeRejectsUnsupportedValues(): void
{
    assertProviderTurnRequestThrows(
        fn () => new ProviderTurnRequest(
            provider: 'deepseek',
            model: 'deepseek-chat',
            systemPrompt: 'Return JSON.',
            messages: durableUserMessage(),
            tools: [],
            responseMimeType: 'text/csv',
        ),
        'unsupported response MIME types must fail closed',
    );
}

function testPromptCachePlanDefaultsToNullAndParticipatesInAuditIdentity(): void
{
    $default = new ProviderTurnRequest('openai', 'gpt-5.6', 'sys', durableUserMessage(), []);

    assertProviderTurnRequest($default->promptCachePlan === null, 'promptCachePlan defaults to null');
    assertProviderTurnRequest(
        array_key_exists('prompt_cache_plan', $default->toRedactedArray()),
        'toRedactedArray exposes prompt_cache_plan',
    );
    assertProviderTurnRequest(
        $default->toRedactedArray()['prompt_cache_plan'] === null,
        'default prompt_cache_plan is null',
    );

    $plan = PromptCachePlan::forStablePrefix(
        mode: PromptCachePlan::MODE_EXPLICIT,
        provider: 'openai',
        model: 'gpt-5.6',
        stableSystemIdentity: hash('sha256', 'system'),
        stableToolSchemaIdentity: hash('sha256', 'tools'),
        stablePrefixIdentity: hash('sha256', 'prefix'),
        breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM],
        ttl: PromptCachePlan::TTL_30_MINUTES,
        minimumInputTokens: 1024,
    );
    $request = new ProviderTurnRequest(
        provider: 'openai',
        model: 'gpt-5.6',
        systemPrompt: 'private system prompt',
        messages: [['role' => 'user', 'content' => 'private user prompt']],
        tools: [],
        promptCachePlan: $plan,
    );

    assertProviderTurnRequest($request->promptCachePlan === $plan, 'promptCachePlan is stored unchanged');
    assertProviderTurnRequest(
        $request->toRedactedArray()['prompt_cache_plan'] === $plan->toAuditArray(),
        'prompt cache identity participates in the audited idempotency payload',
    );
    $audit = json_encode($request->toRedactedArray()['prompt_cache_plan'], JSON_THROW_ON_ERROR);
    assertProviderTurnRequest(! str_contains($audit, 'private'), 'prompt cache audit cannot expose prompt content');
}

testReasoningFieldsDefaultToNull();
testReasoningFieldsCarryThroughRedactedArray();
testReasoningEffortRejectsEmptyAndOverlong();
testResponseMimeTypeDefaultsToNullAndIsAudited();
testResponseMimeTypeRejectsUnsupportedValues();
testPromptCachePlanDefaultsToNullAndParticipatesInAuditIdentity();

echo "ProviderTurnRequestTest passed\n";
