<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\GeminiStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;

function assertGeminiStream(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertGeminiStreamThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|JsonException|LogicException|UnexpectedValueException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function geminiStreamFixture(): string
{
    $contents = file_get_contents(__DIR__.'/fixtures/providers/stream/gemini-generate-content.sse');
    if ($contents === false) {
        throw new RuntimeException('Unable to load the Gemini streaming fixture.');
    }

    return $contents;
}

/**
 * @param array<string, mixed>|null $aggregate
 * @return Closure(array<string, mixed>): ProviderTurnResponse
 */
function captureGeminiAggregate(?array &$aggregate): Closure
{
    return static function (array $response) use (&$aggregate): ProviderTurnResponse {
        $aggregate = $response;
        $candidate = is_array($response['candidates'][0] ?? null) ? $response['candidates'][0] : [];

        return ProviderTurnResponse::final(
            'normalized by the buffered Gemini adapter',
            is_string($response['responseId'] ?? null) ? $response['responseId'] : null,
            is_string($candidate['finishReason'] ?? null) ? $candidate['finishReason'] : null,
            TokenUsage::fromGemini(is_array($response['usageMetadata'] ?? null) ? $response['usageMetadata'] : []),
        );
    };
}

function testGeminiDecoderCoalescesPartialResponsesWithoutInventingSeparators(): void
{
    $aggregate = null;
    $decoder = new GeminiStreamDecoder(captureGeminiAggregate($aggregate));
    $wire = geminiStreamFixture();
    $glyphOffset = strpos($wire, "\u{1F44B}");
    assertGeminiStream(is_int($glyphOffset), 'The Gemini fixture must include a multibyte glyph.');

    $cuts = [1, 67, $glyphOffset + 1, $glyphOffset + 3, $glyphOffset + 4, strlen($wire) - 2, strlen($wire)];
    $events = [];
    $offset = 0;
    foreach ($cuts as $cut) {
        if ($cut <= $offset) {
            continue;
        }
        array_push($events, ...$decoder->push(substr($wire, $offset, $cut - $offset)));
        $offset = $cut;
    }
    $outcome = $decoder->finish();

    assertGeminiStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events) === [
            ProviderStreamEvent::REASONING_DELTA,
            ProviderStreamEvent::TEXT_DELTA,
            ProviderStreamEvent::TEXT_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::USAGE,
        ],
        'Gemini partial responses must normalize to reasoning, text, tool and usage events.',
    );
    assertGeminiStream(
        array_map(static fn (ProviderStreamEvent $event): int => $event->sequence, $events) === [1, 2, 3, 4, 5],
        'Gemini canonical event sequences must remain contiguous.',
    );
    assertGeminiStream($events[1]->payload === ['text' => "Ciao \u{1F44B}. "], 'Gemini split UTF-8 text must survive SSE framing.');
    assertGeminiStream($events[3]->payload === [
        'index' => 2,
        'provider_call_id' => 'gemini_call_1',
        'name' => 'browser_navigate',
        'arguments_delta' => '{"url":"https://example.com"}',
    ], 'Gemini functionCall must map to one complete canonical tool delta.');
    assertGeminiStream($events[4]->payload === [
        'input_tokens' => 38,
        'output_tokens' => 14,
        'total_tokens' => 52,
        'cached_tokens' => 5,
        'cache_read_tokens' => 5,
        'cache_write_tokens' => null,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ], 'Gemini final usage metadata must map to canonical usage.');

    assertGeminiStream($outcome->kind === ProviderTurnResponse::FINAL, 'The clean Gemini EOF must finalize through the buffered normalizer.');
    assertGeminiStream(is_array($aggregate), 'The decoder must provide an aggregated GenerateContentResponse.');
    assertGeminiStream(($aggregate['candidates'][0]['content']['parts'][0] ?? null) === [
        'text' => 'I checked the evidence. ',
        'thought' => true,
        'thoughtSignature' => 'private-signature',
    ], 'Gemini thought text and signature must remain in the provider-native aggregate.');
    assertGeminiStream(
        ! str_contains(json_encode(array_map(static fn (ProviderStreamEvent $event): array => $event->toArray(), $events), JSON_THROW_ON_ERROR), 'private-signature'),
        'Gemini thought signatures must never enter canonical public stream events.',
    );
    assertGeminiStream(($aggregate['candidates'][0]['content']['parts'][1]['text'] ?? null) === "Ciao \u{1F44B}. I will inspect the page. ", 'Adjacent Gemini text chunks must coalesce without artificial newlines.');
    assertGeminiStream(($aggregate['candidates'][0]['content']['parts'][2]['functionCall']['args']['url'] ?? null) === 'https://example.com', 'Gemini function args must preserve object shape.');
    assertGeminiStream(($aggregate['candidates'][0]['finishReason'] ?? null) === 'STOP', 'Gemini final finish reason must survive aggregation.');
}

function testGeminiDecoderFailsClosedForIdentityCandidateAndShapeDrift(): void
{
    $cases = [
        "event: candidate\ndata: {\"responseId\":\"r1\",\"candidates\":[]}\n\n",
        "data: {\"responseId\":\"r1\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"one\"}]}}]}\n\n"
            ."data: {\"responseId\":\"r2\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"two\"}]}}]}\n\n",
        "data: {\"responseId\":\"r1\",\"candidates\":[{\"index\":1,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"wrong\"}]}}]}\n\n",
        "data: {\"responseId\":\"r1\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"user\",\"parts\":[{\"text\":\"wrong role\"}]}}]}\n\n",
        "data: {\"responseId\":\"r1\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"id\":\"c1\",\"name\":\"browser_read\",\"args\":[]}}]}}]}\n\n",
        "data: {not-json}\n\n",
    ];

    foreach ($cases as $wire) {
        $aggregate = null;
        $decoder = new GeminiStreamDecoder(captureGeminiAggregate($aggregate));
        assertGeminiStreamThrows(
            static fn () => $decoder->push($wire),
            'Gemini event names, response IDs, candidate indexes, roles, argument objects and JSON must fail closed on drift.',
        );
    }

    $aggregate = null;
    $empty = new GeminiStreamDecoder(captureGeminiAggregate($aggregate));
    assertGeminiStreamThrows(
        static fn () => $empty->finish(),
        'An empty Gemini stream must not invent a provider outcome.',
    );

    $aggregate = null;
    $finalized = new GeminiStreamDecoder(captureGeminiAggregate($aggregate));
    $finalized->push("data: {\"responseId\":\"r1\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"done\"}]},\"finishReason\":\"STOP\"}]}\n\n");
    $finalized->finish();
    assertGeminiStreamThrows(
        static fn () => $finalized->push("data: {\"responseId\":\"r1\",\"candidates\":[]}\n\n"),
        'Gemini data after clean EOF finalization must fail closed.',
    );
}

testGeminiDecoderCoalescesPartialResponsesWithoutInventingSeparators();
testGeminiDecoderFailsClosedForIdentityCandidateAndShapeDrift();

echo "GeminiStreamDecoderTest passed\n";
