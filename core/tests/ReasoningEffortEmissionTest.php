<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\AnthropicMessagesTurnAdapter;
use Kadmos\Provider\GeminiTurnAdapter;
use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\OpenAiResponsesTurnAdapter;
use Kadmos\Tests\Support\FixtureProviderTransport;
use Kadmos\Tool\ProviderTurnRequest;

function assertReasoningEmission(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/**
 * A transport that records the outbound payload and returns an empty body. The
 * adapter turns that into a failure response, but the request payload — the only
 * thing these tests assert on — is captured first.
 */
function reasoningCaptureTransport(?array &$captured): FixtureProviderTransport
{
    return new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers, int $timeoutMs) use (&$captured): array {
        $captured = $payload;

        return [];
    });
}

function reasoningRequest(
    string $provider,
    string $model,
    ?string $effort,
    bool $thinking = false,
    ?int $maxTokens = null,
    ?float $temperature = null,
): ProviderTurnRequest {
    return new ProviderTurnRequest(
        provider: $provider,
        model: $model,
        systemPrompt: 'sys',
        messages: [['role' => 'user', 'content' => 'hi']],
        tools: [],
        maxTokens: $maxTokens,
        temperature: $temperature,
        resources: [],
        reasoningEffort: $effort,
        reasoningVisible: $thinking,
    );
}

function testOpenAiChatEmitsFlatReasoningEffort(): void
{
    $captured = null;
    $adapter = new OpenAiChatTurnAdapter('deepseek', 'https://api.deepseek.com/v1/chat/completions', 'k', reasoningCaptureTransport($captured));

    $adapter->start(reasoningRequest('deepseek', 'deepseek-v4-reasoner', 'high'));
    assertReasoningEmission(($captured['reasoning_effort'] ?? null) === 'high', 'OpenAI chat emits a flat reasoning_effort');

    $captured = null;
    $adapter->start(reasoningRequest('deepseek', 'deepseek-v4-flash', 'off'));
    assertReasoningEmission(! array_key_exists('reasoning_effort', $captured), 'off emits no reasoning_effort');
}

function testOpenAiResponsesEmitsNestedReasoning(): void
{
    $captured = null;
    $adapter = new OpenAiResponsesTurnAdapter('https://api.openai.com/v1/responses', 'k', reasoningCaptureTransport($captured));

    $adapter->start(reasoningRequest('openai', 'gpt-5.1', 'medium'));
    assertReasoningEmission(($captured['reasoning']['effort'] ?? null) === 'medium', 'OpenAI responses nests reasoning.effort');
}

function testAnthropicEmitsThinkingBudgetAndDropsTemperature(): void
{
    $adapter = new AnthropicMessagesTurnAdapter('https://api.anthropic.com/v1/messages', 'k', reasoningCaptureTransport($capturedOn));

    // Thinking toggle ON: a thinking block with the level's budget, and temperature omitted.
    $adapter->start(reasoningRequest('anthropic', 'claude-opus', 'high', thinking: true, maxTokens: 20000, temperature: 0.7));
    assertReasoningEmission(($capturedOn['thinking']['type'] ?? null) === 'enabled', 'Anthropic emits thinking when the toggle is on');
    assertReasoningEmission(($capturedOn['thinking']['budget_tokens'] ?? null) === 16384, 'Anthropic high maps to budget 16384');
    assertReasoningEmission(! array_key_exists('temperature', $capturedOn), 'Anthropic drops temperature when thinking is enabled');

    // Thinking toggle OFF: no thinking block, temperature preserved.
    $captured = null;
    $offAdapter = new AnthropicMessagesTurnAdapter('https://api.anthropic.com/v1/messages', 'k', reasoningCaptureTransport($captured));
    $offAdapter->start(reasoningRequest('anthropic', 'claude-sonnet', 'high', thinking: false, maxTokens: 20000, temperature: 0.7));
    assertReasoningEmission(! array_key_exists('thinking', $captured), 'Anthropic omits thinking when the toggle is off');
    assertReasoningEmission(($captured['temperature'] ?? null) === 0.7, 'Anthropic keeps temperature when thinking is off');
}

function testGeminiEmitsThinkingBudgetInsideGenerationConfig(): void
{
    $captured = null;
    $adapter = new GeminiTurnAdapter('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', 'k', reasoningCaptureTransport($captured));

    $adapter->start(reasoningRequest('gemini', 'gemini-2.5-pro', 'medium'));
    assertReasoningEmission(($captured['generationConfig']['thinkingConfig']['thinkingBudget'] ?? null) === 8192, 'Gemini nests thinkingBudget inside generationConfig');
}

testOpenAiChatEmitsFlatReasoningEffort();
testOpenAiResponsesEmitsNestedReasoning();
testAnthropicEmitsThinkingBudgetAndDropsTemperature();
testGeminiEmitsThinkingBudgetInsideGenerationConfig();

echo "ReasoningEffortEmissionTest passed\n";
