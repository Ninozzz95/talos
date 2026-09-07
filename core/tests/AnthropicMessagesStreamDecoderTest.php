<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\AnthropicMessagesStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;

function assertAnthropicStream(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertAnthropicStreamThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|JsonException|LogicException|UnexpectedValueException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function anthropicStreamFixture(): string
{
    $contents = file_get_contents(__DIR__.'/fixtures/providers/stream/anthropic-messages.sse');
    if ($contents === false) {
        throw new RuntimeException('Unable to load the Anthropic Messages streaming fixture.');
    }

    return $contents;
}

/**
 * @param array<string, mixed>|null $message
 * @return Closure(array<string, mixed>): ProviderTurnResponse
 */
function captureAnthropicMessage(?array &$message): Closure
{
    return static function (array $response) use (&$message): ProviderTurnResponse {
        $message = $response;

        return ProviderTurnResponse::final(
            'normalized by the buffered Anthropic adapter',
            is_string($response['id'] ?? null) ? $response['id'] : null,
            is_string($response['stop_reason'] ?? null) ? $response['stop_reason'] : null,
            TokenUsage::fromAnthropic(is_array($response['usage'] ?? null) ? $response['usage'] : []),
        );
    };
}

function testAnthropicDecoderPreservesLifecycleThinkingSignatureAndToolInput(): void
{
    $message = null;
    $decoder = new AnthropicMessagesStreamDecoder(captureAnthropicMessage($message));
    $wire = anthropicStreamFixture();
    $glyphOffset = strpos($wire, "\u{1F44B}");
    assertAnthropicStream(is_int($glyphOffset), 'The Anthropic fixture must include a multibyte glyph.');

    $cuts = [3, 83, $glyphOffset + 1, $glyphOffset + 3, $glyphOffset + 4, strlen($wire) - 5, strlen($wire)];
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

    assertAnthropicStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events) === [
            ProviderStreamEvent::HEARTBEAT,
            ProviderStreamEvent::REASONING_DELTA,
            ProviderStreamEvent::TEXT_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::USAGE,
        ],
        'Anthropic lifecycle events must normalize to heartbeat, reasoning, text, tool and usage events.',
    );
    assertAnthropicStream(
        array_map(static fn (ProviderStreamEvent $event): int => $event->sequence, $events) === [1, 2, 3, 4, 5, 6, 7],
        'Anthropic canonical event sequences must remain contiguous.',
    );
    assertAnthropicStream($events[0]->payload === [], 'Anthropic ping must remain a payload-free heartbeat.');
    assertAnthropicStream($events[2]->payload === [
        'text' => "Ciao \u{1F44B}. I will inspect the page. ",
    ], 'Anthropic text deltas must preserve split UTF-8 exactly.');
    assertAnthropicStream($events[3]->payload === [
        'index' => 2,
        'provider_call_id' => 'toolu_browser_1',
        'name' => 'browser_navigate',
        'arguments_delta' => null,
    ], 'Anthropic tool block start must establish canonical tool identity.');
    assertAnthropicStream($events[4]->payload['arguments_delta'] === '{"url":"https://', 'Anthropic partial JSON must remain incremental.');
    assertAnthropicStream($events[5]->payload['arguments_delta'] === 'example.com"}', 'Anthropic partial JSON must preserve wire order.');
    assertAnthropicStream($events[6]->payload === [
        'input_tokens' => 60,
        'output_tokens' => 18,
        'total_tokens' => 78,
        'cached_tokens' => 6,
        'cache_read_tokens' => 6,
        'cache_write_tokens' => 2,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ], 'Anthropic start and delta usage must merge into the canonical usage event.');

    assertAnthropicStream($outcome->kind === ProviderTurnResponse::FINAL, 'Anthropic reconstructed messages must finalize through the buffered normalizer.');
    assertAnthropicStream(is_array($message), 'The decoder must provide the reconstructed native message to the finalizer.');
    assertAnthropicStream(($message['content'][0] ?? null) === [
        'type' => 'thinking',
        'thinking' => 'I checked the evidence. ',
        'signature' => 'sig_private_continuation',
    ], 'Anthropic thinking signature must survive only in provider-native continuation state.');
    assertAnthropicStream(
        ! str_contains(json_encode(array_map(static fn (ProviderStreamEvent $event): array => $event->toArray(), $events), JSON_THROW_ON_ERROR), 'sig_private_continuation'),
        'Anthropic thinking signatures must never leak into canonical public stream events.',
    );
    assertAnthropicStream(($message['content'][2]['input'] ?? null) === [
        'url' => 'https://example.com',
    ], 'Anthropic partial input JSON must close as an object in the buffered response shape.');
    assertAnthropicStream(($message['stop_reason'] ?? null) === 'tool_use', 'Anthropic message delta stop reason must survive reconstruction.');
}

function testAnthropicDecoderToleratesUnknownEventsButFailsClosedOnLifecycleViolations(): void
{
    $message = null;
    $unknown = new AnthropicMessagesStreamDecoder(captureAnthropicMessage($message));
    $events = $unknown->push(
        "event: message_start\n"
        ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n"
        ."event: future_event\n"
        ."data: {\"type\":\"future_event\",\"future_field\":true}\n\n"
        ."event: message_delta\n"
        ."data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":1}}\n\n"
        ."event: message_stop\n"
        ."data: {\"type\":\"message_stop\"}\n\n",
    );
    $unknown->finish();
    assertAnthropicStream(count($events) === 1 && $events[0]->kind === ProviderStreamEvent::USAGE, 'Unknown Anthropic events must be ignored without losing known lifecycle state.');

    $cases = [
        "event: content_block_delta\n"
            ."data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":1}}\n\n",
        "event: content_block_delta\n"
            ."data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"orphan\"}}\n\n",
        "event: message_start\n"
            ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n"
            ."event: content_block_start\n"
            ."data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
        "event: message_start\n"
            ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n"
            ."event: content_block_start\n"
            ."data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"t1\",\"name\":\"browser_read\",\"input\":{}}}\n\n"
            ."event: content_block_delta\n"
            ."data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"[]\"}}\n\n"
            ."event: content_block_stop\n"
            ."data: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "event: error\n"
            ."data: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"busy\"}}\n\n",
    ];

    foreach ($cases as $wire) {
        $message = null;
        $decoder = new AnthropicMessagesStreamDecoder(captureAnthropicMessage($message));
        assertAnthropicStreamThrows(
            static fn () => $decoder->push($wire),
            'Anthropic event drift, orphan/gapped blocks, list-shaped tool input and provider errors must fail closed.',
        );
    }

    $message = null;
    $missingStop = new AnthropicMessagesStreamDecoder(captureAnthropicMessage($message));
    $missingStop->push(
        "event: message_start\n"
        ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n",
    );
    assertAnthropicStreamThrows(
        static fn () => $missingStop->finish(),
        'Anthropic streams without message_stop must fail closed.',
    );

    $message = null;
    $openBlock = new AnthropicMessagesStreamDecoder(captureAnthropicMessage($message));
    $openBlock->push(
        "event: message_start\n"
        ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n"
        ."event: content_block_start\n"
        ."data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
    );
    assertAnthropicStreamThrows(
        static fn () => $openBlock->push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"),
        'Anthropic message_stop with an open content block must fail closed.',
    );
}

testAnthropicDecoderPreservesLifecycleThinkingSignatureAndToolInput();
testAnthropicDecoderToleratesUnknownEventsButFailsClosedOnLifecycleViolations();

echo "AnthropicMessagesStreamDecoderTest passed\n";
