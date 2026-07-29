<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\OpenAiChatStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;

function assertOpenAiChatStream(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertOpenAiChatStreamThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|JsonException|LogicException|UnexpectedValueException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function openAiChatStreamFixture(): string
{
    $contents = file_get_contents(__DIR__.'/fixtures/providers/stream/openai-chat.sse');
    if ($contents === false) {
        throw new RuntimeException('Unable to load the OpenAI Chat streaming fixture.');
    }

    return $contents;
}

/**
 * @param array<string, mixed>|null $aggregate
 * @return Closure(array<string, mixed>): ProviderTurnResponse
 */
function captureOpenAiChatAggregate(?array &$aggregate): Closure
{
    return static function (array $response) use (&$aggregate): ProviderTurnResponse {
        $aggregate = $response;
        $usage = TokenUsage::fromOpenAi(is_array($response['usage'] ?? null) ? $response['usage'] : []);

        return ProviderTurnResponse::final(
            'normalized by the buffered adapter',
            is_string($response['id'] ?? null) ? $response['id'] : null,
            is_string($response['choices'][0]['finish_reason'] ?? null)
                ? $response['choices'][0]['finish_reason']
                : null,
            $usage,
        );
    };
}

function testOpenAiChatStreamDecoderReassemblesCanonicalDeltasAndNativeResponse(): void
{
    $aggregate = null;
    $decoder = new OpenAiChatStreamDecoder(captureOpenAiChatAggregate($aggregate));
    $wire = openAiChatStreamFixture();
    $glyph = "\u{1F44B}";
    $glyphOffset = strpos($wire, $glyph);
    assertOpenAiChatStream(is_int($glyphOffset), 'The fixture must include a multibyte glyph.');

    $cuts = [
        1,
        37,
        $glyphOffset + 1,
        $glyphOffset + 3,
        $glyphOffset + strlen($glyph),
        strlen($wire) - 9,
        strlen($wire),
    ];
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

    assertOpenAiChatStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events) === [
            ProviderStreamEvent::REASONING_DELTA,
            ProviderStreamEvent::TEXT_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::USAGE,
        ],
        'OpenAI Chat chunks must normalize to reasoning, text, tool-call and usage events in wire order.',
    );
    assertOpenAiChatStream(
        array_map(static fn (ProviderStreamEvent $event): int => $event->sequence, $events) === [1, 2, 3, 4, 5],
        'OpenAI Chat stream events must use contiguous canonical sequences.',
    );
    assertOpenAiChatStream($events[1]->payload === [
        'text' => "Ciao \u{1F44B}. I will inspect the page. ",
    ], 'Split multibyte text must survive incremental SSE parsing exactly.');
    assertOpenAiChatStream($events[2]->payload === [
        'index' => 0,
        'provider_call_id' => 'call_browser_1',
        'name' => 'browser_navigate',
        'arguments_delta' => '{"url":"https://',
    ], 'The initial streamed tool-call delta must preserve ID, name and argument fragment.');
    assertOpenAiChatStream($events[3]->payload === [
        'index' => 0,
        'provider_call_id' => null,
        'name' => null,
        'arguments_delta' => 'example.com"}',
    ], 'Subsequent tool-call argument fragments must remain independently observable.');
    assertOpenAiChatStream($events[4]->payload === [
        'input_tokens' => 41,
        'output_tokens' => 12,
        'total_tokens' => 53,
        'cached_tokens' => 7,
        'cache_read_tokens' => 7,
        'cache_write_tokens' => 2,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ], 'Stream usage must normalize through the canonical token contract.');

    assertOpenAiChatStream($outcome->kind === ProviderTurnResponse::FINAL, 'The decoder must finalize through the supplied buffered normalizer.');
    assertOpenAiChatStream($outcome->responseId === 'chatcmpl_stream_1', 'The finalizer must receive the stable provider response ID.');
    assertOpenAiChatStream(is_array($aggregate), 'The decoder must provide a reconstructed native response to the finalizer.');
    assertOpenAiChatStream(($aggregate['choices'][0]['message']['content'] ?? null) === "Ciao \u{1F44B}. I will inspect the page. ", 'Streamed text must reassemble into the buffered message shape.');
    assertOpenAiChatStream(($aggregate['choices'][0]['message']['reasoning_content'] ?? null) === 'I checked the evidence. ', 'Visible reasoning must remain separate in the buffered message shape.');
    assertOpenAiChatStream(($aggregate['choices'][0]['message']['tool_calls'][0] ?? null) === [
        'id' => 'call_browser_1',
        'type' => 'function',
        'function' => [
            'name' => 'browser_navigate',
            'arguments' => '{"url":"https://example.com"}',
        ],
    ], 'Indexed tool-call fragments must reassemble into the exact buffered adapter shape.');
    assertOpenAiChatStream(($aggregate['choices'][0]['finish_reason'] ?? null) === 'tool_calls', 'The final stop reason must survive reconstruction.');
    assertOpenAiChatStream(($aggregate['usage']['total_tokens'] ?? null) === 53, 'Provider-native usage must reach the finalizer unchanged.');
}

function testOpenAiChatStreamDecoderFailsClosedForMalformedOrIncompleteStreams(): void
{
    $cases = [
        "data: {not-json}\n\ndata: [DONE]\n\n",
        "data: {\"id\":\"one\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":null}]}\n\n"
            ."data: {\"id\":\"two\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n"
            ."data: [DONE]\n\n",
        "data: {\"id\":\"one\",\"choices\":[{\"index\":1,\"delta\":{\"content\":\"wrong choice\"},\"finish_reason\":null}]}\n\n"
            ."data: [DONE]\n\n",
        "data: {\"id\":\"one\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":1,\"id\":\"call_2\",\"type\":\"function\",\"function\":{\"name\":\"browser_read\",\"arguments\":\"{}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n"
            ."data: [DONE]\n\n",
    ];

    foreach ($cases as $wire) {
        $aggregate = null;
        $decoder = new OpenAiChatStreamDecoder(captureOpenAiChatAggregate($aggregate));
        assertOpenAiChatStreamThrows(
            static fn () => $decoder->push($wire),
            'Malformed JSON, response drift and invalid choice/tool indexes must fail closed during streaming.',
        );
    }

    $aggregate = null;
    $missingDone = new OpenAiChatStreamDecoder(captureOpenAiChatAggregate($aggregate));
    $missingDone->push("data: {\"id\":\"one\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial\"},\"finish_reason\":\"stop\"}]}\n\n");
    assertOpenAiChatStreamThrows(
        static fn () => $missingDone->finish(),
        'A Chat Completions stream without the [DONE] sentinel must fail closed.',
    );

    $aggregate = null;
    $afterDone = new OpenAiChatStreamDecoder(captureOpenAiChatAggregate($aggregate));
    $afterDone->push("data: [DONE]\n\n");
    assertOpenAiChatStreamThrows(
        static fn () => $afterDone->push("data: {\"id\":\"late\",\"choices\":[]}\n\n"),
        'Provider data after [DONE] must fail closed.',
    );
}

testOpenAiChatStreamDecoderReassemblesCanonicalDeltasAndNativeResponse();
testOpenAiChatStreamDecoderFailsClosedForMalformedOrIncompleteStreams();

echo "OpenAiChatStreamDecoderTest passed\n";
