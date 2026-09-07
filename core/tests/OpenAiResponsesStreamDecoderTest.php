<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\OpenAiResponsesStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;

function assertOpenAiResponsesStream(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertOpenAiResponsesStreamThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|JsonException|LogicException|UnexpectedValueException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function openAiResponsesStreamFixture(): string
{
    $contents = file_get_contents(__DIR__.'/fixtures/providers/stream/openai-responses.sse');
    if ($contents === false) {
        throw new RuntimeException('Unable to load the OpenAI Responses streaming fixture.');
    }

    return $contents;
}

/**
 * @param array<string, mixed>|null $terminal
 * @return Closure(array<string, mixed>): ProviderTurnResponse
 */
function captureOpenAiResponsesTerminal(?array &$terminal): Closure
{
    return static function (array $response) use (&$terminal): ProviderTurnResponse {
        $terminal = $response;

        return ProviderTurnResponse::final(
            'normalized by the buffered Responses adapter',
            is_string($response['id'] ?? null) ? $response['id'] : null,
            is_string($response['status'] ?? null) ? $response['status'] : null,
            TokenUsage::fromOpenAiResponses(is_array($response['usage'] ?? null) ? $response['usage'] : []),
        );
    };
}

function testOpenAiResponsesDecoderUsesDeltasForUiAndTerminalResponseForFinalization(): void
{
    $terminal = null;
    $decoder = new OpenAiResponsesStreamDecoder(captureOpenAiResponsesTerminal($terminal));
    $wire = openAiResponsesStreamFixture();
    $glyphOffset = strpos($wire, "\u{1F44B}");
    assertOpenAiResponsesStream(is_int($glyphOffset), 'The Responses fixture must include a multibyte glyph.');

    $cuts = [2, 71, $glyphOffset + 1, $glyphOffset + 3, $glyphOffset + 4, strlen($wire) - 3, strlen($wire)];
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

    assertOpenAiResponsesStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events) === [
            ProviderStreamEvent::REASONING_DELTA,
            ProviderStreamEvent::TEXT_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::TOOL_CALL_DELTA,
            ProviderStreamEvent::USAGE,
        ],
        'Responses wire events must map to canonical reasoning, text, tool and usage deltas.',
    );
    assertOpenAiResponsesStream(
        array_map(static fn (ProviderStreamEvent $event): int => $event->sequence, $events) === [1, 2, 3, 4, 5, 6],
        'Responses canonical event sequences must be contiguous.',
    );
    assertOpenAiResponsesStream($events[1]->payload === [
        'text' => "Ciao \u{1F44B}. I will inspect the page. ",
    ], 'Responses text deltas must preserve split UTF-8 exactly.');
    assertOpenAiResponsesStream($events[2]->payload === [
        'index' => 2,
        'provider_call_id' => 'call_browser_1',
        'name' => 'browser_navigate',
        'arguments_delta' => null,
    ], 'The output-item event must establish canonical tool identity.');
    assertOpenAiResponsesStream($events[3]->payload['arguments_delta'] === '{"url":"https://', 'The first Responses argument fragment must stay incremental.');
    assertOpenAiResponsesStream($events[4]->payload['arguments_delta'] === 'example.com"}', 'The second Responses argument fragment must stay incremental.');
    assertOpenAiResponsesStream($events[5]->payload === [
        'input_tokens' => 47,
        'output_tokens' => 15,
        'total_tokens' => 62,
        'cached_tokens' => 9,
        'cache_read_tokens' => 9,
        'cache_write_tokens' => 3,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => null,
        'cache_write_1h_tokens' => null,
    ], 'Terminal Responses usage must be projected before canonical completion.');

    assertOpenAiResponsesStream($outcome->kind === ProviderTurnResponse::FINAL, 'The terminal response must finalize through the buffered normalizer.');
    assertOpenAiResponsesStream($outcome->responseId === 'resp_stream_1', 'Response identity must survive terminal normalization.');
    assertOpenAiResponsesStream(is_array($terminal), 'The decoder must pass the real terminal response to the finalizer.');
    assertOpenAiResponsesStream(($terminal['status'] ?? null) === 'completed', 'The official terminal status must remain authoritative.');
    assertOpenAiResponsesStream(($terminal['output'][2]['call_id'] ?? null) === 'call_browser_1', 'The official terminal tool call must remain byte-structured for buffered normalization.');
}

function testOpenAiResponsesDecoderFailsClosedAcrossProtocolDriftAndMissingTerminal(): void
{
    $cases = [
        "event: response.output_text.delta\n"
            ."data: {\"type\":\"response.function_call_arguments.delta\",\"response_id\":\"r1\",\"output_index\":0,\"item_id\":\"i1\",\"delta\":\"{}\"}\n\n",
        "event: response.created\n"
            ."data: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\",\"status\":\"in_progress\",\"output\":[]}}\n\n"
            ."event: response.output_text.delta\n"
            ."data: {\"type\":\"response.output_text.delta\",\"response_id\":\"r2\",\"output_index\":0,\"content_index\":0,\"item_id\":\"m1\",\"delta\":\"drift\"}\n\n",
        "event: response.output_text.delta\n"
            ."data: {\"type\":\"response.output_text.delta\",\"response_id\":\"r1\",\"output_index\":-1,\"content_index\":0,\"item_id\":\"m1\",\"delta\":\"bad\"}\n\n",
        "event: response.function_call_arguments.delta\n"
            ."data: {\"type\":\"response.function_call_arguments.delta\",\"response_id\":\"r1\",\"output_index\":0,\"item_id\":\"fc1\",\"delta\":\"{}\"}\n\n",
    ];

    foreach ($cases as $wire) {
        $terminal = null;
        $decoder = new OpenAiResponsesStreamDecoder(captureOpenAiResponsesTerminal($terminal));
        assertOpenAiResponsesStreamThrows(
            static fn () => $decoder->push($wire),
            'Event-type drift, response drift, invalid indexes and orphan call deltas must fail closed.',
        );
    }

    $terminal = null;
    $missing = new OpenAiResponsesStreamDecoder(captureOpenAiResponsesTerminal($terminal));
    $missing->push(
        "event: response.created\n"
        ."data: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\",\"status\":\"in_progress\",\"output\":[]}}\n\n",
    );
    assertOpenAiResponsesStreamThrows(
        static fn () => $missing->finish(),
        'A Responses stream without an official terminal response must fail closed.',
    );

    $terminal = null;
    $afterTerminal = new OpenAiResponsesStreamDecoder(captureOpenAiResponsesTerminal($terminal));
    $afterTerminal->push(
        "event: response.completed\n"
        ."data: {\"type\":\"response.completed\",\"response\":{\"id\":\"r1\",\"status\":\"completed\",\"output\":[],\"usage\":{}}}\n\n",
    );
    assertOpenAiResponsesStreamThrows(
        static fn () => $afterTerminal->push(
            "event: response.output_text.delta\n"
            ."data: {\"type\":\"response.output_text.delta\",\"response_id\":\"r1\",\"output_index\":0,\"content_index\":0,\"item_id\":\"m1\",\"delta\":\"late\"}\n\n",
        ),
        'Responses data after an official terminal event must fail closed.',
    );
}

testOpenAiResponsesDecoderUsesDeltasForUiAndTerminalResponseForFinalization();
testOpenAiResponsesDecoderFailsClosedAcrossProtocolDriftAndMissingTerminal();

echo "OpenAiResponsesStreamDecoderTest passed\n";
