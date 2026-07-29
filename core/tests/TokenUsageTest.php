<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\TokenUsage;

function assertTokenUsage(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertTokenUsageThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function testOpenAiUsageSeparatesReportedReadsWritesAndOmission(): void
{
    $reported = TokenUsage::fromOpenAi([
        'prompt_tokens' => 2006,
        'completion_tokens' => 300,
        'total_tokens' => 2306,
        'prompt_tokens_details' => [
            'cached_tokens' => 1920,
            'cache_write_tokens' => 12,
        ],
    ]);

    assertTokenUsage($reported->cachedTokens === 1920, 'Legacy cachedTokens must mirror reads only.');
    assertTokenUsage($reported->cacheReadTokens === 1920, 'OpenAI cache reads must remain separate.');
    assertTokenUsage($reported->cacheWriteTokens === 12, 'OpenAI cache writes must remain separate.');
    assertTokenUsage($reported->cacheMissTokens === null, 'OpenAI missing cache miss is unknown.');

    $omitted = TokenUsage::fromOpenAi([
        'prompt_tokens' => 12,
        'completion_tokens' => 3,
        'total_tokens' => 15,
    ]);
    assertTokenUsage($omitted->cachedTokens === 0, 'Legacy cache reads remain non-null for compatibility.');
    assertTokenUsage($omitted->cacheReadTokens === null, 'Omitted cache reads must remain unknown.');
    assertTokenUsage($omitted->cacheWriteTokens === null, 'Omitted cache writes must remain unknown.');

    $zero = TokenUsage::fromOpenAi([
        'prompt_tokens' => 12,
        'completion_tokens' => 3,
        'total_tokens' => 15,
        'prompt_tokens_details' => ['cached_tokens' => 0, 'cache_write_tokens' => 0],
    ]);
    assertTokenUsage($zero->cacheReadTokens === 0, 'Provider-reported zero reads must remain zero.');
    assertTokenUsage($zero->cacheWriteTokens === 0, 'Provider-reported zero writes must remain zero.');
}

function testDeepSeekUsageSeparatesHitAndMissTokens(): void
{
    $usage = TokenUsage::fromOpenAi([
        'prompt_tokens' => 100,
        'completion_tokens' => 20,
        'total_tokens' => 120,
        'prompt_cache_hit_tokens' => 72,
        'prompt_cache_miss_tokens' => 28,
    ]);

    assertTokenUsage($usage->cachedTokens === 72, 'DeepSeek hits must feed the compatibility read alias.');
    assertTokenUsage($usage->cacheReadTokens === 72, 'DeepSeek hits must map to cache reads.');
    assertTokenUsage($usage->cacheWriteTokens === null, 'DeepSeek does not report controllable cache writes.');
    assertTokenUsage($usage->cacheMissTokens === 28, 'DeepSeek misses must remain separate.');
}

function testAnthropicUsageComputesCanonicalInputAndPreservesWriteBreakdown(): void
{
    $usage = TokenUsage::fromAnthropic([
        'input_tokens' => 50,
        'output_tokens' => 10,
        'cache_read_input_tokens' => 1800,
        'cache_creation_input_tokens' => 248,
        'cache_creation' => [
            'ephemeral_5m_input_tokens' => 148,
            'ephemeral_1h_input_tokens' => 100,
        ],
    ]);

    assertTokenUsage($usage->inputTokens === 2098, 'Anthropic canonical input must include uncached, read, and write tokens.');
    assertTokenUsage($usage->totalTokens === 2108, 'Anthropic canonical total must include all input plus output.');
    assertTokenUsage($usage->cachedTokens === 1800, 'Anthropic compatibility cache value must exclude writes.');
    assertTokenUsage($usage->cacheReadTokens === 1800, 'Anthropic reads must remain separate.');
    assertTokenUsage($usage->cacheWriteTokens === 248, 'Anthropic writes must remain separate.');
    assertTokenUsage($usage->cacheWrite5mTokens === 148, 'Anthropic 5m writes must remain separate.');
    assertTokenUsage($usage->cacheWrite1hTokens === 100, 'Anthropic 1h writes must remain separate.');
    assertTokenUsage($usage->cacheMissTokens === null, 'Anthropic does not report cache misses.');
}

function testAnthropicUsageRejectsContradictoryWriteBreakdown(): void
{
    assertTokenUsageThrows(
        fn () => TokenUsage::fromAnthropic([
            'input_tokens' => 50,
            'output_tokens' => 10,
            'cache_creation_input_tokens' => 248,
            'cache_creation' => [
                'ephemeral_5m_input_tokens' => 100,
                'ephemeral_1h_input_tokens' => 100,
            ],
        ]),
        'Contradictory Anthropic write totals must fail closed.',
    );
}

function testGeminiUsagePreservesUnknownVersusReportedRead(): void
{
    $reported = TokenUsage::fromGemini([
        'promptTokenCount' => 40,
        'candidatesTokenCount' => 10,
        'totalTokenCount' => 50,
        'cachedContentTokenCount' => 24,
    ]);
    assertTokenUsage($reported->cacheReadTokens === 24, 'Gemini cached content maps to cache reads.');

    $omitted = TokenUsage::fromGemini([
        'promptTokenCount' => 40,
        'candidatesTokenCount' => 10,
        'totalTokenCount' => 50,
    ]);
    assertTokenUsage($omitted->cacheReadTokens === null, 'Omitted Gemini cache usage remains unknown.');
}

function testUsageWireShapeKeepsCompatibilityAndNullableMetrics(): void
{
    $usage = new TokenUsage(
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedTokens: 25,
        cacheReadTokens: 25,
        cacheWriteTokens: 4,
        cacheMissTokens: 71,
        cacheWrite5mTokens: 3,
        cacheWrite1hTokens: 1,
    );

    assertTokenUsage($usage->toArray() === [
        'input_tokens' => 100,
        'output_tokens' => 20,
        'total_tokens' => 120,
        'cached_tokens' => 25,
        'cache_read_tokens' => 25,
        'cache_write_tokens' => 4,
        'cache_miss_tokens' => 71,
        'cache_write_5m_tokens' => 3,
        'cache_write_1h_tokens' => 1,
    ], 'Usage wire shape must expose exact compatibility and nullable metrics.');

    assertTokenUsageThrows(
        fn () => new TokenUsage(10, 1, 11, 5, 4),
        'Conflicting compatibility and read metrics must fail closed.',
    );
}

function testUsageCheckpointHydrationPreservesLegacyAndNullableMetrics(): void
{
    $legacy = TokenUsage::fromArray([
        'input_tokens' => 20,
        'output_tokens' => 4,
        'total_tokens' => 24,
        'cached_tokens' => 12,
    ]);
    assertTokenUsage($legacy->cachedTokens === 12, 'Historical cached_tokens must remain readable.');
    assertTokenUsage($legacy->cacheReadTokens === 12, 'Historical cached_tokens must hydrate as cache reads.');
    assertTokenUsage($legacy->cacheWriteTokens === null, 'Historical checkpoints must not invent cache writes.');

    $expanded = TokenUsage::fromArray([
        'input_tokens' => 20,
        'output_tokens' => 4,
        'total_tokens' => 24,
        'cached_tokens' => 0,
        'cache_read_tokens' => 0,
        'cache_write_tokens' => 0,
        'cache_miss_tokens' => 20,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ]);
    assertTokenUsage($expanded->cacheReadTokens === 0, 'Reported zero cache reads must survive checkpoint hydration.');
    assertTokenUsage($expanded->cacheWriteTokens === 0, 'Reported zero cache writes must survive checkpoint hydration.');
    assertTokenUsage($expanded->cacheMissTokens === 20, 'Cache misses must survive checkpoint hydration.');
    assertTokenUsage($expanded->cacheWrite5mTokens === null, 'Unavailable TTL metrics must remain null.');

    $empty = TokenUsage::fromArray([]);
    assertTokenUsage($empty->toArray() === [
        'input_tokens' => 0,
        'output_tokens' => 0,
        'total_tokens' => 0,
        'cached_tokens' => 0,
        'cache_read_tokens' => null,
        'cache_write_tokens' => null,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ], 'A missing historical usage envelope must hydrate without false cache telemetry.');
}

function testUsageCheckpointHydrationRejectsMalformedCanonicalValues(): void
{
    assertTokenUsageThrows(
        fn () => TokenUsage::fromArray(['input_tokens' => '20']),
        'String token values must fail closed at the checkpoint boundary.',
    );
    assertTokenUsageThrows(
        fn () => TokenUsage::fromArray(['cache_read_tokens' => -1]),
        'Negative nullable cache metrics must fail closed.',
    );
    assertTokenUsageThrows(
        fn () => TokenUsage::fromArray(['provider_private_metric' => 1]),
        'Unknown provider usage keys must not enter the canonical checkpoint.',
    );
}

testOpenAiUsageSeparatesReportedReadsWritesAndOmission();
testDeepSeekUsageSeparatesHitAndMissTokens();
testAnthropicUsageComputesCanonicalInputAndPreservesWriteBreakdown();
testAnthropicUsageRejectsContradictoryWriteBreakdown();
testGeminiUsagePreservesUnknownVersusReportedRead();
testUsageWireShapeKeepsCompatibilityAndNullableMetrics();
testUsageCheckpointHydrationPreservesLegacyAndNullableMetrics();
testUsageCheckpointHydrationRejectsMalformedCanonicalValues();

echo "TokenUsageTest passed\n";
