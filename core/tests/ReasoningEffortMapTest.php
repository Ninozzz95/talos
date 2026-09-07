<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\ReasoningEffortMap;

function assertReasoningEffort(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertReasoningEffortThrows(callable $fn, string $message): void
{
    try {
        $fn();
    } catch (\InvalidArgumentException $e) {
        return;
    }
    throw new RuntimeException($message);
}

/**
 * "off" / null must emit no reasoning parameter at all, for every target.
 */
function testReasoningEffortOffEmitsNothing(): void
{
    $targets = [
        ReasoningEffortMap::TARGET_OPENAI_CHAT,
        ReasoningEffortMap::TARGET_OPENAI_RESPONSES,
        ReasoningEffortMap::TARGET_ANTHROPIC,
        ReasoningEffortMap::TARGET_GEMINI,
    ];

    foreach ($targets as $target) {
        assertReasoningEffort(
            ReasoningEffortMap::paramsFor($target, null) === [],
            "null effort must emit no params for {$target}",
        );
        assertReasoningEffort(
            ReasoningEffortMap::paramsFor($target, 'off') === [],
            "off effort must emit no params for {$target}",
        );
        assertReasoningEffort(
            ReasoningEffortMap::paramsFor($target, ' OFF ') === [],
            "off is trimmed and case-insensitive for {$target}",
        );
    }
}

/**
 * OpenAI Chat Completions uses a flat top-level reasoning_effort string and has
 * no visible-thinking toggle, so the level passes through and thinking is ignored.
 */
function testOpenAiChatMapsFlatReasoningEffort(): void
{
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_OPENAI_CHAT, 'high') === ['reasoning_effort' => 'high'],
        'OpenAI chat maps high -> reasoning_effort:high',
    );
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_OPENAI_CHAT, 'medium', true) === ['reasoning_effort' => 'medium'],
        'OpenAI chat ignores the thinking toggle',
    );
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_OPENAI_CHAT, '  High ') === ['reasoning_effort' => 'high'],
        'levels are trimmed and lowercased',
    );
}

/**
 * OpenAI Responses nests the effort under reasoning.effort.
 */
function testOpenAiResponsesNestsReasoningEffort(): void
{
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_OPENAI_RESPONSES, 'low') === ['reasoning' => ['effort' => 'low']],
        'OpenAI responses maps low -> reasoning.effort:low',
    );
}

/**
 * Anthropic extended thinking is opt-in (the composer toggle); the effort level
 * sets the token budget, clamped to leave output headroom below max_tokens.
 */
function testAnthropicThinkingBudget(): void
{
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_ANTHROPIC, 'high', false, 20000) === [],
        'Anthropic without the thinking toggle emits nothing',
    );

    $high = ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_ANTHROPIC, 'high', true, 20000);
    assertReasoningEffort(($high['thinking']['type'] ?? null) === 'enabled', 'Anthropic thinking enabled when toggle on');
    assertReasoningEffort(($high['thinking']['budget_tokens'] ?? null) === 16384, 'Anthropic high -> budget 16384 within a generous max_tokens');

    $clamped = ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_ANTHROPIC, 'max', true, 6000);
    assertReasoningEffort(($clamped['thinking']['budget_tokens'] ?? null) === 4976, 'Anthropic max budget clamped to max_tokens - output headroom (6000-1024)');

    $defaultMax = ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_ANTHROPIC, 'max', true, null);
    assertReasoningEffort(($defaultMax['thinking']['budget_tokens'] ?? null) === 3072, 'Anthropic null max_tokens -> 4096 ceiling -> budget 3072');

    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_ANTHROPIC, 'high', true, 1500) === [],
        'Anthropic with too-small max_tokens cannot think -> empty',
    );
}

/**
 * Gemini maps the effort level to generationConfig.thinkingConfig.thinkingBudget,
 * capped at the provider maximum. Gemini exposes no separate thinking toggle.
 */
function testGeminiThinkingBudget(): void
{
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_GEMINI, 'medium') === ['thinkingConfig' => ['thinkingBudget' => 8192]],
        'Gemini medium -> thinkingBudget 8192',
    );
    assertReasoningEffort(
        ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_GEMINI, 'max') === ['thinkingConfig' => ['thinkingBudget' => 32768]],
        'Gemini max -> thinkingBudget capped at 32768',
    );
}

/**
 * Fail-closed on an unknown level or an unknown target.
 */
function testUnknownLevelAndTargetThrow(): void
{
    assertReasoningEffortThrows(
        fn () => ReasoningEffortMap::paramsFor(ReasoningEffortMap::TARGET_OPENAI_CHAT, 'ultra'),
        'unknown reasoning level must throw InvalidArgumentException',
    );
    assertReasoningEffortThrows(
        fn () => ReasoningEffortMap::paramsFor('mystery-target', 'high'),
        'unknown target must throw InvalidArgumentException',
    );
}

testReasoningEffortOffEmitsNothing();
testOpenAiChatMapsFlatReasoningEffort();
testOpenAiResponsesNestsReasoningEffort();
testAnthropicThinkingBudget();
testGeminiThinkingBudget();
testUnknownLevelAndTargetThrow();

echo "ReasoningEffortMapTest passed\n";
