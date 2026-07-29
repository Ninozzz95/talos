<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use UnexpectedValueException;

final class ProviderSseParser
{
    private string $buffer = '';
    private string $eventName = '';
    private string $lastEventId = '';
    /** @var list<string> */
    private array $dataLines = [];
    private int $recordBytes = 0;

    public function __construct(private readonly int $maxBufferBytes = 1_048_576)
    {
        if ($maxBufferBytes < 1) {
            throw new InvalidArgumentException('Provider SSE parser buffer limit must be positive.');
        }
    }

    /**
     * @return list<array{event: string, data: string, id: string|null}>
     */
    public function push(string $chunk): array
    {
        if ($chunk === '') {
            return [];
        }
        if (strlen($chunk) > $this->maxBufferBytes) {
            throw new UnexpectedValueException('Provider SSE chunk exceeds the configured buffer limit.');
        }

        $this->buffer .= $chunk;
        $events = [];

        while (true) {
            $lineEnding = $this->nextLineEnding();
            if ($lineEnding === null) {
                break;
            }
            [$offset, $length] = $lineEnding;
            $line = substr($this->buffer, 0, $offset);
            $this->buffer = substr($this->buffer, $offset + $length);
            $event = $this->processLine($line);
            if ($event !== null) {
                $events[] = $event;
            }
        }

        $this->assertWithinLimit();

        return $events;
    }

    /**
     * @return list<array{event: string, data: string, id: string|null}>
     */
    public function finish(): array
    {
        if ($this->buffer !== '' || $this->recordBytes !== 0 || $this->dataLines !== [] || $this->eventName !== '') {
            throw new UnexpectedValueException('Provider SSE stream ended with an incomplete event record.');
        }

        return [];
    }

    /** @return array{int, int}|null */
    private function nextLineEnding(): ?array
    {
        $carriage = strpos($this->buffer, "\r");
        $lineFeed = strpos($this->buffer, "\n");
        if ($carriage === false && $lineFeed === false) {
            return null;
        }

        if ($carriage !== false && ($lineFeed === false || $carriage < $lineFeed)) {
            if ($carriage === strlen($this->buffer) - 1) {
                return null;
            }

            return [$carriage, $this->buffer[$carriage + 1] === "\n" ? 2 : 1];
        }

        return [(int) $lineFeed, 1];
    }

    /**
     * @return array{event: string, data: string, id: string|null}|null
     */
    private function processLine(string $line): ?array
    {
        $this->recordBytes += strlen($line) + 1;
        if ($this->recordBytes > $this->maxBufferBytes) {
            throw new UnexpectedValueException('Provider SSE event exceeds the configured buffer limit.');
        }

        if ($line === '') {
            $event = $this->dispatch();
            $this->recordBytes = 0;

            return $event;
        }
        if ($line[0] === ':') {
            return null;
        }

        $separator = strpos($line, ':');
        if ($separator === false) {
            $field = $line;
            $value = '';
        } else {
            $field = substr($line, 0, $separator);
            $value = substr($line, $separator + 1);
            if (str_starts_with($value, ' ')) {
                $value = substr($value, 1);
            }
        }

        match ($field) {
            'event' => $this->eventName = $value,
            'data' => $this->dataLines[] = $value,
            'id' => $this->acceptEventId($value),
            default => null,
        };

        return null;
    }

    /**
     * @return array{event: string, data: string, id: string|null}|null
     */
    private function dispatch(): ?array
    {
        if ($this->dataLines === []) {
            $this->eventName = '';

            return null;
        }

        $data = implode("\n", $this->dataLines);
        $event = $this->eventName !== '' ? $this->eventName : 'message';
        if (preg_match('//u', $data) !== 1 || preg_match('//u', $event) !== 1) {
            throw new UnexpectedValueException('Provider SSE event must be valid UTF-8.');
        }

        $record = [
            'event' => $event,
            'data' => $data,
            'id' => $this->lastEventId !== '' ? $this->lastEventId : null,
        ];
        $this->eventName = '';
        $this->dataLines = [];

        return $record;
    }

    private function acceptEventId(string $value): void
    {
        if (str_contains($value, "\0")) {
            return;
        }
        if (preg_match('//u', $value) !== 1) {
            throw new UnexpectedValueException('Provider SSE event ID must be valid UTF-8.');
        }

        $this->lastEventId = $value;
    }

    private function assertWithinLimit(): void
    {
        if (strlen($this->buffer) + $this->recordBytes > $this->maxBufferBytes) {
            throw new UnexpectedValueException('Provider SSE parser buffer limit was exceeded.');
        }
    }
}
