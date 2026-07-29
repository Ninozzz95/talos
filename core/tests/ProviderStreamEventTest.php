<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\ProviderFailure;
use Kadmos\Provider\ProviderStream;
use Kadmos\Provider\ProviderStreamCancelledException;
use Kadmos\Provider\ProviderStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;

function assertProviderStream(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertProviderStreamThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|LogicException|RuntimeException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function testCanonicalProviderStreamEventsValidateKindsSequencesAndPayloads(): void
{
    $text = new ProviderStreamEvent(
        ProviderStreamEvent::TEXT_DELTA,
        1,
        ['text' => "Hello \u{1F44B}"],
    );
    assertProviderStream($text->toArray() === [
        'kind' => 'text_delta',
        'sequence' => 1,
        'payload' => ['text' => "Hello \u{1F44B}"],
    ], 'Text deltas must serialize through the canonical event contract.');
    assertProviderStream(! $text->isTerminal(), 'Text deltas are not terminal.');

    $completed = ProviderStreamEvent::fromOutcome(
        2,
        ProviderTurnResponse::final(
            'Hello there.',
            'resp_1',
            'stop',
            new TokenUsage(5, 3, 8),
        ),
    );
    assertProviderStream($completed->kind === ProviderStreamEvent::COMPLETED, 'Final outcomes must map to a completed event.');
    assertProviderStream($completed->isTerminal(), 'Completed events must be terminal.');
    assertProviderStream($completed->payload === [
        'outcome' => 'final',
        'response_id' => 'resp_1',
        'stop_reason' => 'stop',
    ], 'Completed events expose only the bounded public outcome envelope.');

    $failed = ProviderStreamEvent::fromOutcome(
        3,
        ProviderTurnResponse::failure(new ProviderFailure(
            'PROVIDER_HTTP_ERROR',
            'The provider request failed.',
            true,
            529,
            ['provider_response' => 'must-not-leak'],
        )),
    );
    assertProviderStream($failed->kind === ProviderStreamEvent::FAILED, 'Failure outcomes must map to a failed event.');
    assertProviderStream(! array_key_exists('details', $failed->payload), 'Provider failure details must never enter the public stream.');

    $usage = new ProviderStreamEvent(ProviderStreamEvent::USAGE, 4, [
        'input_tokens' => 100,
        'output_tokens' => 20,
        'total_tokens' => 120,
        'cached_tokens' => 25,
        'cache_read_tokens' => 25,
        'cache_write_tokens' => 4,
        'cache_miss_tokens' => null,
        'cache_write_5m_tokens' => 3,
        'cache_write_1h_tokens' => 1,
    ]);
    assertProviderStream(
        $usage->payload['cache_miss_tokens'] === null,
        'Provider stream usage must preserve omitted cache metrics as null.',
    );

    foreach ([
        fn () => new ProviderStreamEvent('unknown', 1, []),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::HEARTBEAT, 0, []),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::TEXT_DELTA, 1, ['text' => '']),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::TEXT_DELTA, 1, ['text' => 'ok', 'secret' => 'no']),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::USAGE, 1, [
            'input_tokens' => -1,
            'output_tokens' => 0,
            'total_tokens' => 0,
            'cached_tokens' => 0,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'cache_miss_tokens' => null,
            'cache_write_5m_tokens' => null,
            'cache_write_1h_tokens' => null,
        ]),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::USAGE, 1, [
            'input_tokens' => 1,
            'output_tokens' => 0,
            'total_tokens' => 1,
            'cached_tokens' => 0,
            'cache_read_tokens' => '0',
            'cache_write_tokens' => null,
            'cache_miss_tokens' => null,
            'cache_write_5m_tokens' => null,
            'cache_write_1h_tokens' => null,
        ]),
        fn () => new ProviderStreamEvent(ProviderStreamEvent::FAILED, 1, [
            'code' => 'BAD CODE',
            'message' => 'bad',
            'retryable' => false,
            'http_status' => null,
        ]),
    ] as $invalid) {
        assertProviderStreamThrows($invalid, 'Malformed canonical stream events must fail closed.');
    }
}

function testProviderStreamYieldsOneTerminalEventAndRetainsFinalOutcome(): void
{
    $decoder = new class implements ProviderStreamDecoder
    {
        private int $sequence = 0;

        public function push(string $chunk): array
        {
            $this->sequence++;

            return [new ProviderStreamEvent(
                ProviderStreamEvent::TEXT_DELTA,
                $this->sequence,
                ['text' => $chunk],
            )];
        }

        public function finish(): ProviderTurnResponse
        {
            return ProviderTurnResponse::final(
                'Hello world.',
                'resp_stream',
                'stop',
                new TokenUsage(4, 2, 6),
            );
        }
    };

    $stream = new ProviderStream(['Hello ', 'world.'], $decoder);
    $events = iterator_to_array($stream);

    assertProviderStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events)
            === ['text_delta', 'text_delta', 'completed'],
        'A provider stream must yield deltas followed by exactly one canonical terminal event.',
    );
    assertProviderStream(
        array_map(static fn (ProviderStreamEvent $event): int => $event->sequence, $events)
            === [1, 2, 3],
        'Provider stream sequences must remain strictly monotonic.',
    );
    assertProviderStream($stream->finalOutcome()->text === 'Hello world.', 'The final provider outcome must remain available after complete consumption.');

    assertProviderStreamThrows(
        static fn () => iterator_to_array($stream),
        'A provider stream must not be consumed more than once.',
    );
}

function testProviderStreamRejectsPrematureTerminalAndIncompleteConsumption(): void
{
    $terminalDecoder = new class implements ProviderStreamDecoder
    {
        public function push(string $chunk): array
        {
            return [new ProviderStreamEvent(ProviderStreamEvent::CANCELLED, 1, ['reason' => 'early'])];
        }

        public function finish(): ProviderTurnResponse
        {
            return ProviderTurnResponse::final('Never reached.', null, 'stop', new TokenUsage(0, 0, 0));
        }
    };

    assertProviderStreamThrows(
        static fn () => iterator_to_array(new ProviderStream(['chunk'], $terminalDecoder)),
        'Provider decoders must not inject terminal events before finalization.',
    );

    $stream = new ProviderStream(['partial'], new class implements ProviderStreamDecoder
    {
        public function push(string $chunk): array
        {
            return [new ProviderStreamEvent(ProviderStreamEvent::TEXT_DELTA, 1, ['text' => $chunk])];
        }

        public function finish(): ProviderTurnResponse
        {
            return ProviderTurnResponse::final('partial', null, 'stop', new TokenUsage(0, 1, 1));
        }
    });

    assertProviderStreamThrows(
        static fn () => $stream->finalOutcome(),
        'A final outcome must not be exposed before the stream is fully consumed.',
    );
}

function testProviderStreamConvertsTypedTransportCancellationIntoOneTerminalEvent(): void
{
    $chunks = (static function (): Generator {
        yield 'partial';
        throw new ProviderStreamCancelledException('user_requested');
    })();
    $stream = new ProviderStream($chunks, new class implements ProviderStreamDecoder
    {
        private string $text = '';

        public function push(string $chunk): array
        {
            $this->text .= $chunk;

            return [new ProviderStreamEvent(
                ProviderStreamEvent::TEXT_DELTA,
                1,
                ['text' => $chunk],
            )];
        }

        public function finish(): ProviderTurnResponse
        {
            throw new RuntimeException('A cancelled stream must not call decoder finish.');
        }
    });

    $events = iterator_to_array($stream);
    assertProviderStream(
        array_map(static fn (ProviderStreamEvent $event): string => $event->kind, $events)
            === [ProviderStreamEvent::TEXT_DELTA, ProviderStreamEvent::CANCELLED],
        'Typed transport cancellation must become exactly one canonical terminal event.',
    );
    assertProviderStream($events[1]->sequence === 2, 'Cancellation must preserve contiguous stream sequencing.');
    assertProviderStream($events[1]->payload === ['reason' => 'user_requested'], 'Cancellation must expose only its bounded public reason.');
    assertProviderStreamThrows(
        static fn () => $stream->finalOutcome(),
        'Cancelled streams cannot expose an invented final provider outcome.',
    );
}

testCanonicalProviderStreamEventsValidateKindsSequencesAndPayloads();
testProviderStreamYieldsOneTerminalEventAndRetainsFinalOutcome();
testProviderStreamRejectsPrematureTerminalAndIncompleteConsumption();
testProviderStreamConvertsTypedTransportCancellationIntoOneTerminalEvent();

echo "ProviderStreamEventTest passed\n";
