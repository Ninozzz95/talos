<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;
use JsonException;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;
use LogicException;
use stdClass;
use UnexpectedValueException;

final class AnthropicMessagesStreamDecoder implements ProviderStreamDecoder
{
    private const MAX_BLOCK_BYTES = 262_144;

    private readonly ProviderSseParser $parser;
    private int $sequence = 0;
    private bool $started = false;
    private bool $messageDeltaSeen = false;
    private bool $stopped = false;
    private bool $finalized = false;
    private ?int $openBlockIndex = null;
    /** @var array<string, mixed>|null */
    private ?array $message = null;
    /** @var list<array<string, mixed>> */
    private array $blocks = [];
    /** @var array<int, string> */
    private array $partialToolJson = [];
    /** @var array<string, mixed> */
    private array $usage = [];

    /** @param Closure(array<string, mixed>): ProviderTurnResponse $finalizer */
    public function __construct(
        private readonly Closure $finalizer,
        int $maxBufferBytes = 1_048_576,
    ) {
        $this->parser = new ProviderSseParser($maxBufferBytes);
    }

    /** @return list<ProviderStreamEvent> */
    public function push(string $chunk): array
    {
        if ($this->finalized) {
            throw new LogicException('Anthropic Messages stream decoder is already finalized.');
        }

        $events = [];
        foreach ($this->parser->push($chunk) as $record) {
            if ($this->stopped) {
                throw new UnexpectedValueException('Anthropic Messages stream contained data after message_stop.');
            }
            array_push($events, ...$this->decodeRecord($record));
        }

        return $events;
    }

    public function finish(): ProviderTurnResponse
    {
        if ($this->finalized) {
            throw new LogicException('Anthropic Messages stream decoder cannot be finalized twice.');
        }
        $this->parser->finish();
        if (! $this->started || ! $this->stopped || $this->message === null) {
            throw new UnexpectedValueException('Anthropic Messages stream ended before message_stop.');
        }
        $this->finalized = true;
        $this->message['content'] = $this->blocks;
        $this->message['usage'] = $this->usage;

        $outcome = ($this->finalizer)($this->message);
        if (! $outcome instanceof ProviderTurnResponse) {
            throw new UnexpectedValueException('Anthropic Messages finalizer returned an invalid provider outcome.');
        }

        return $outcome;
    }

    /**
     * @param array{event: string, data: string, id: string|null} $record
     * @return list<ProviderStreamEvent>
     */
    private function decodeRecord(array $record): array
    {
        try {
            $payload = json_decode($record['data'], false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('Anthropic Messages stream contained invalid JSON.', previous: $exception);
        }
        if (! $payload instanceof stdClass) {
            throw new UnexpectedValueException('Anthropic Messages stream payloads must be JSON objects.');
        }
        $type = $this->boundedString($payload->type ?? null, 'Anthropic event type', 128);
        if ($record['event'] !== 'message' && $record['event'] !== $type) {
            throw new UnexpectedValueException('Anthropic SSE event name does not match its payload type.');
        }

        return match ($type) {
            'message_start' => $this->messageStart($payload),
            'ping' => [$this->event(ProviderStreamEvent::HEARTBEAT, [])],
            'content_block_start' => $this->contentBlockStart($payload),
            'content_block_delta' => $this->contentBlockDelta($payload),
            'content_block_stop' => $this->contentBlockStop($payload),
            'message_delta' => $this->messageDelta($payload),
            'message_stop' => $this->messageStop(),
            'error' => throw new UnexpectedValueException('Anthropic Messages stream emitted a provider error event.'),
            default => [],
        };
    }

    /** @return list<ProviderStreamEvent> */
    private function messageStart(stdClass $payload): array
    {
        if ($this->started || $this->blocks !== []) {
            throw new UnexpectedValueException('Anthropic Messages stream emitted message_start more than once.');
        }
        $message = $payload->message ?? null;
        if (! $message instanceof stdClass
            || ($message->role ?? null) !== 'assistant'
            || ! is_array($message->content ?? null)
            || $message->content !== []
            || ! ($message->usage ?? null) instanceof stdClass) {
            throw new UnexpectedValueException('Anthropic message_start payload is invalid.');
        }
        $this->boundedString($message->id ?? null, 'Anthropic message ID', 256);
        $this->message = $this->objectToArray($message);
        $this->usage = $this->objectToArray($message->usage);
        $this->started = true;

        return [];
    }

    /** @return list<ProviderStreamEvent> */
    private function contentBlockStart(stdClass $payload): array
    {
        $this->requireActiveMessage();
        if ($this->openBlockIndex !== null || $this->messageDeltaSeen) {
            throw new UnexpectedValueException('Anthropic content blocks must be sequential and precede message_delta.');
        }
        $index = $this->nonNegativeInt($payload->index ?? null, 'Anthropic content block index');
        if ($index !== count($this->blocks)) {
            throw new UnexpectedValueException('Anthropic content block indexes must be contiguous.');
        }
        $block = $payload->content_block ?? null;
        if (! $block instanceof stdClass) {
            throw new UnexpectedValueException('Anthropic content_block_start must contain an object.');
        }
        $type = $this->boundedString($block->type ?? null, 'Anthropic content block type', 128);
        $native = $this->objectToArray($block);
        $events = [];

        if ($type === 'text') {
            $native['text'] = $this->boundedString($block->text ?? null, 'Anthropic text block', self::MAX_BLOCK_BYTES, allowEmpty: true);
        } elseif ($type === 'thinking') {
            $native['thinking'] = $this->boundedString($block->thinking ?? null, 'Anthropic thinking block', self::MAX_BLOCK_BYTES, allowEmpty: true);
            $native['signature'] = $this->boundedString($block->signature ?? null, 'Anthropic thinking signature', self::MAX_BLOCK_BYTES, allowEmpty: true);
        } elseif ($type === 'tool_use') {
            $native['id'] = $this->boundedString($block->id ?? null, 'Anthropic tool-use ID', 256);
            $native['name'] = $this->boundedString($block->name ?? null, 'Anthropic tool-use name', 128);
            if (! ($block->input ?? null) instanceof stdClass) {
                throw new UnexpectedValueException('Anthropic tool-use input must be an object.');
            }
            $native['input'] = $this->objectToArray($block->input);
            $this->partialToolJson[$index] = '';
            $events[] = $this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
                'index' => $index,
                'provider_call_id' => $native['id'],
                'name' => $native['name'],
                'arguments_delta' => null,
            ]);
        }

        $this->blocks[] = $native;
        $this->openBlockIndex = $index;

        return $events;
    }

    /** @return list<ProviderStreamEvent> */
    private function contentBlockDelta(stdClass $payload): array
    {
        $this->requireActiveMessage();
        $index = $this->nonNegativeInt($payload->index ?? null, 'Anthropic content block index');
        if ($this->openBlockIndex !== $index || ! isset($this->blocks[$index])) {
            throw new UnexpectedValueException('Anthropic content delta does not match the active block.');
        }
        $delta = $payload->delta ?? null;
        if (! $delta instanceof stdClass) {
            throw new UnexpectedValueException('Anthropic content delta must be an object.');
        }
        $deltaType = $this->boundedString($delta->type ?? null, 'Anthropic content delta type', 128);
        $blockType = $this->blocks[$index]['type'] ?? null;

        if ($blockType === 'text' && $deltaType === 'text_delta') {
            $text = $this->boundedString($delta->text ?? null, 'Anthropic text delta', 65_536, allowEmpty: true);
            if ($text === '') {
                return [];
            }
            $this->blocks[$index]['text'] = $this->appendBounded(
                (string) $this->blocks[$index]['text'],
                $text,
                self::MAX_BLOCK_BYTES,
                'Anthropic text block',
            );

            return [$this->event(ProviderStreamEvent::TEXT_DELTA, ['text' => $text])];
        }
        if ($blockType === 'thinking' && $deltaType === 'thinking_delta') {
            $thinking = $this->boundedString($delta->thinking ?? null, 'Anthropic thinking delta', 65_536, allowEmpty: true);
            if ($thinking === '') {
                return [];
            }
            $this->blocks[$index]['thinking'] = $this->appendBounded(
                (string) $this->blocks[$index]['thinking'],
                $thinking,
                self::MAX_BLOCK_BYTES,
                'Anthropic thinking block',
            );

            return [$this->event(ProviderStreamEvent::REASONING_DELTA, ['text' => $thinking])];
        }
        if ($blockType === 'thinking' && $deltaType === 'signature_delta') {
            $signature = $this->boundedString($delta->signature ?? null, 'Anthropic signature delta', 65_536, allowEmpty: true);
            $this->blocks[$index]['signature'] = $this->appendBounded(
                (string) $this->blocks[$index]['signature'],
                $signature,
                self::MAX_BLOCK_BYTES,
                'Anthropic thinking signature',
            );

            return [];
        }
        if ($blockType === 'tool_use' && $deltaType === 'input_json_delta') {
            $partial = $this->boundedString($delta->partial_json ?? null, 'Anthropic partial tool JSON', 65_536, allowEmpty: true);
            if ($partial === '') {
                return [];
            }
            $this->partialToolJson[$index] = $this->appendBounded(
                $this->partialToolJson[$index],
                $partial,
                self::MAX_BLOCK_BYTES,
                'Anthropic partial tool JSON',
            );

            return [$this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
                'index' => $index,
                'provider_call_id' => null,
                'name' => null,
                'arguments_delta' => $partial,
            ])];
        }
        if (! in_array($blockType, ['text', 'thinking', 'tool_use'], true)) {
            return [];
        }

        throw new UnexpectedValueException('Anthropic content delta type does not match its active block.');
    }

    /** @return list<ProviderStreamEvent> */
    private function contentBlockStop(stdClass $payload): array
    {
        $this->requireActiveMessage();
        $index = $this->nonNegativeInt($payload->index ?? null, 'Anthropic content block index');
        if ($this->openBlockIndex !== $index) {
            throw new UnexpectedValueException('Anthropic content_block_stop does not match the active block.');
        }
        if (($this->blocks[$index]['type'] ?? null) === 'tool_use' && $this->partialToolJson[$index] !== '') {
            try {
                $input = json_decode($this->partialToolJson[$index], false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                throw new UnexpectedValueException('Anthropic partial tool input is not valid JSON.', previous: $exception);
            }
            if (! $input instanceof stdClass) {
                throw new UnexpectedValueException('Anthropic partial tool input must close as an object.');
            }
            $this->blocks[$index]['input'] = $this->objectToArray($input);
        }
        $this->openBlockIndex = null;

        return [];
    }

    /** @return list<ProviderStreamEvent> */
    private function messageDelta(stdClass $payload): array
    {
        $this->requireActiveMessage();
        if ($this->openBlockIndex !== null || $this->messageDeltaSeen) {
            throw new UnexpectedValueException('Anthropic message_delta must occur once after all content blocks close.');
        }
        $delta = $payload->delta ?? null;
        $usage = $payload->usage ?? null;
        if (! $delta instanceof stdClass || ! $usage instanceof stdClass || $this->message === null) {
            throw new UnexpectedValueException('Anthropic message_delta payload is invalid.');
        }
        if (property_exists($delta, 'stop_reason')) {
            $this->message['stop_reason'] = $delta->stop_reason === null
                ? null
                : $this->boundedString($delta->stop_reason, 'Anthropic stop reason', 128);
        }
        if (property_exists($delta, 'stop_sequence')) {
            $this->message['stop_sequence'] = $delta->stop_sequence;
        }
        $this->usage = [...$this->usage, ...$this->objectToArray($usage)];
        $this->messageDeltaSeen = true;
        $canonicalUsage = TokenUsage::fromAnthropic($this->usage);

        return [$this->event(ProviderStreamEvent::USAGE, $canonicalUsage->toArray())];
    }

    /** @return list<ProviderStreamEvent> */
    private function messageStop(): array
    {
        $this->requireActiveMessage();
        if ($this->openBlockIndex !== null || ! $this->messageDeltaSeen) {
            throw new UnexpectedValueException('Anthropic message_stop requires closed blocks and message_delta.');
        }
        $this->stopped = true;

        return [];
    }

    private function requireActiveMessage(): void
    {
        if (! $this->started || $this->stopped || $this->message === null) {
            throw new UnexpectedValueException('Anthropic event arrived outside an active message.');
        }
    }

    /** @param array<string, mixed> $payload */
    private function event(string $kind, array $payload): ProviderStreamEvent
    {
        $this->sequence++;

        return new ProviderStreamEvent($kind, $this->sequence, $payload);
    }

    private function nonNegativeInt(mixed $value, string $label): int
    {
        if (! is_int($value) || $value < 0) {
            throw new UnexpectedValueException("{$label} must be a non-negative integer.");
        }

        return $value;
    }

    private function boundedString(mixed $value, string $label, int $limit, bool $allowEmpty = false): string
    {
        if (! is_string($value) || strlen($value) > $limit || preg_match('//u', $value) !== 1) {
            throw new UnexpectedValueException("{$label} must be a bounded UTF-8 string.");
        }
        if (! $allowEmpty && trim($value) === '') {
            throw new UnexpectedValueException("{$label} must not be empty.");
        }

        return $value;
    }

    private function appendBounded(string $current, string $delta, int $limit, string $label): string
    {
        if (strlen($current) + strlen($delta) > $limit) {
            throw new UnexpectedValueException("{$label} exceeded its byte limit.");
        }

        return $current.$delta;
    }

    /** @return array<string, mixed> */
    private function objectToArray(stdClass $object): array
    {
        $result = [];
        foreach (get_object_vars($object) as $key => $value) {
            $result[$key] = $this->jsonValueToArray($value);
        }

        return $result;
    }

    private function jsonValueToArray(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            return $this->objectToArray($value);
        }
        if (is_array($value)) {
            return array_map($this->jsonValueToArray(...), $value);
        }

        return $value;
    }
}
