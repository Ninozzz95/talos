<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\ProviderSseParser;

function assertProviderSse(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertProviderSseThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|UnexpectedValueException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

function testProviderSseParserHandlesArbitraryChunksUtf8AndCrlf(): void
{
    $parser = new ProviderSseParser(maxBufferBytes: 1024);
    $wire = "event: content_block_delta\r\nid: 7\r\ndata: {\"text\":\"ciao \u{1F44B}\"}\r\n\r\n";
    $wave = "\u{1F44B}";
    $waveOffset = strpos($wire, $wave);
    assertProviderSse(is_int($waveOffset), 'Fixture must contain the multibyte glyph.');

    $chunks = [
        substr($wire, 0, $waveOffset + 1),
        substr($wire, $waveOffset + 1, 2),
        substr($wire, $waveOffset + 3, 5),
        substr($wire, $waveOffset + 8),
    ];

    $events = [];
    foreach ($chunks as $chunk) {
        array_push($events, ...$parser->push($chunk));
    }
    array_push($events, ...$parser->finish());

    assertProviderSse($events === [[
        'event' => 'content_block_delta',
        'data' => "{\"text\":\"ciao \u{1F44B}\"}",
        'id' => '7',
    ]], 'The SSE parser must preserve split UTF-8 and CRLF framing exactly.');
}

function testProviderSseParserHandlesCommentsMultilineDataAndLastEventId(): void
{
    $parser = new ProviderSseParser(maxBufferBytes: 1024);
    $events = $parser->push(
        ": heartbeat\n"
        ."id: evt-1\n"
        ."data: first\n"
        ."data: second\n"
        ."unknown: ignored\n\n"
        ."data: third\n\n",
    );
    array_push($events, ...$parser->finish());

    assertProviderSse($events === [
        ['event' => 'message', 'data' => "first\nsecond", 'id' => 'evt-1'],
        ['event' => 'message', 'data' => 'third', 'id' => 'evt-1'],
    ], 'Comments and unknown fields are ignored while data lines and Last-Event-ID follow WHATWG semantics.');
}

function testProviderSseParserRejectsOversizeMalformedAndIncompleteInput(): void
{
    assertProviderSseThrows(
        static fn () => new ProviderSseParser(maxBufferBytes: 0),
        'The SSE parser buffer limit must be positive.',
    );

    $oversize = new ProviderSseParser(maxBufferBytes: 16);
    assertProviderSseThrows(
        static fn () => $oversize->push('data: '.str_repeat('x', 32)),
        'An oversized unframed SSE record must fail closed.',
    );

    $invalidUtf8 = new ProviderSseParser(maxBufferBytes: 1024);
    assertProviderSseThrows(
        static fn () => $invalidUtf8->push("data: \xC3\x28\n\n"),
        'Invalid UTF-8 event data must fail closed.',
    );

    $incomplete = new ProviderSseParser(maxBufferBytes: 1024);
    $incomplete->push('data: {"partial":true}');
    assertProviderSseThrows(
        static fn () => $incomplete->finish(),
        'A provider stream ending mid-record must fail closed instead of inventing completion.',
    );
}

testProviderSseParserHandlesArbitraryChunksUtf8AndCrlf();
testProviderSseParserHandlesCommentsMultilineDataAndLastEventId();
testProviderSseParserRejectsOversizeMalformedAndIncompleteInput();

echo "ProviderSseParserTest passed\n";
