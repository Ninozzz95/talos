<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;
use InvalidArgumentException;
use JsonException;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;
use LogicException;
use stdClass;
use UnexpectedValueException;

final class OpenAiChatStreamDecoder implements ProviderStreamDecoder
{
    private const MAX_TEXT_BYTES = 1_048_576;
    private const MAX_REASONING_BYTES = 1_048_576;
    private const MAX_REFUSAL_BYTES = 65_536;
    private const MAX_TOOL_ARGUMENT_BYTES = 262_144;
    private const MAX_TOOL_CALLS = 64;

    private readonly ProviderSseParser $parser;
    private int $sequence = 0;
    private bool $done = false;
    private bool $finalized = false;
    private bool $choiceSeen = false;
    private ?string $responseId = null;
    private ?string $finishReason = null;
    private string $text = '';
    private string $reasoning = '';
    private string $refusal = '';
    /** @var array<int, array{id: string, type: string, function: array{name: string, arguments: string}}> */
    private array $toolCalls = [];
    /** @var array<string, mixed>|null */
    private ?array $usage = null;

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
            throw new LogicException('OpenAI Chat stream decoder is already finalized.');
        }

        $events = [];
        foreach ($this->parser->push($chunk) as $record) {
            if ($this->done) {
                throw new UnexpectedValueException('OpenAI Chat stream contained data after the [DONE] sentinel.');
            }
            if ($record['event'] !== 'message') {
                throw new UnexpectedValueException('OpenAI Chat stream used an unsupported SSE event name.');
            }

            if (trim($record['data']) === '[DONE]') {
                $this->done = true;
                continue;
            }

            array_push($events, ...$this->decodeRecord($record['data']));
        }

        return $events;
    }

    public function finish(): ProviderTurnResponse
    {
        if ($this->finalized) {
            throw new LogicException('OpenAI Chat stream decoder cannot be finalized twice.');
        }
        $this->parser->finish();
        if (! $this->done) {
            throw new UnexpectedValueException('OpenAI Chat stream ended without the [DONE] sentinel.');
        }
        if (! $this->choiceSeen) {
            throw new UnexpectedValueException('OpenAI Chat stream did not contain a completion choice.');
        }

        $this->finalized = true;
        $message = [
            'role' => 'assistant',
            'content' => $this->text !== '' ? $this->text : null,
        ];
        if ($this->reasoning !== '') {
            $message['reasoning_content'] = $this->reasoning;
        }
        if ($this->refusal !== '') {
            $message['refusal'] = $this->refusal;
        }
        if ($this->toolCalls !== []) {
            $message['tool_calls'] = $this->completedToolCalls();
        }

        $response = [
            'id' => $this->responseId,
            'choices' => [[
                'index' => 0,
                'message' => $message,
                'finish_reason' => $this->finishReason,
            ]],
        ];
        if ($this->usage !== null) {
            $response['usage'] = $this->usage;
        }

        $outcome = ($this->finalizer)($response);
        if (! $outcome instanceof ProviderTurnResponse) {
            throw new UnexpectedValueException('OpenAI Chat stream finalizer returned an invalid provider outcome.');
        }

        return $outcome;
    }

    /** @return list<ProviderStreamEvent> */
    private function decodeRecord(string $data): array
    {
        try {
            $chunk = json_decode($data, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('OpenAI Chat stream contained invalid JSON.', previous: $exception);
        }
        if (! $chunk instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Chat stream chunks must be JSON objects.');
        }

        if (property_exists($chunk, 'id')) {
            $id = $this->boundedString($chunk->id, 'OpenAI Chat response ID', 256);
            if ($this->responseId !== null && $this->responseId !== $id) {
                throw new UnexpectedValueException('OpenAI Chat stream response ID changed mid-stream.');
            }
            $this->responseId = $id;
        }

        if (! property_exists($chunk, 'choices') || ! is_array($chunk->choices)) {
            throw new UnexpectedValueException('OpenAI Chat stream choices must be a list.');
        }
        if (count($chunk->choices) > 1) {
            throw new UnexpectedValueException('OpenAI Chat stream must contain at most one choice per chunk.');
        }

        $events = [];
        if ($chunk->choices !== []) {
            $choice = $chunk->choices[0];
            if (! $choice instanceof stdClass || ! is_int($choice->index ?? null) || $choice->index !== 0) {
                throw new UnexpectedValueException('OpenAI Chat stream choice index must be zero.');
            }
            if (! ($choice->delta ?? null) instanceof stdClass) {
                throw new UnexpectedValueException('OpenAI Chat stream choice delta must be an object.');
            }
            $this->choiceSeen = true;
            array_push($events, ...$this->decodeDelta($choice->delta));
            $this->acceptFinishReason($choice->finish_reason ?? null);
        }

        if (property_exists($chunk, 'usage') && $chunk->usage !== null) {
            if (! $chunk->usage instanceof stdClass || $this->usage !== null) {
                throw new UnexpectedValueException('OpenAI Chat stream usage must be a single object.');
            }
            $this->usage = $this->objectToArray($chunk->usage);
            $usage = TokenUsage::fromOpenAi($this->usage);
            $events[] = $this->event(ProviderStreamEvent::USAGE, $usage->toArray());
        } elseif ($chunk->choices === []) {
            throw new UnexpectedValueException('OpenAI Chat stream emitted an empty non-usage chunk.');
        }

        return $events;
    }

    /** @return list<ProviderStreamEvent> */
    private function decodeDelta(stdClass $delta): array
    {
        if (property_exists($delta, 'role')
            && $delta->role !== null
            && $delta->role !== 'assistant') {
            throw new UnexpectedValueException('OpenAI Chat stream role must remain assistant.');
        }

        $events = [];
        if (property_exists($delta, 'content') && $delta->content !== null) {
            $content = $this->boundedString($delta->content, 'OpenAI Chat text delta', 65_536, allowEmpty: true);
            if ($content !== '') {
                $this->text = $this->appendBounded($this->text, $content, self::MAX_TEXT_BYTES, 'OpenAI Chat streamed text');
                $events[] = $this->event(ProviderStreamEvent::TEXT_DELTA, ['text' => $content]);
            }
        }
        if (property_exists($delta, 'reasoning_content') && $delta->reasoning_content !== null) {
            $reasoning = $this->boundedString($delta->reasoning_content, 'OpenAI Chat reasoning delta', 65_536, allowEmpty: true);
            if ($reasoning !== '') {
                $this->reasoning = $this->appendBounded($this->reasoning, $reasoning, self::MAX_REASONING_BYTES, 'OpenAI Chat streamed reasoning');
                $events[] = $this->event(ProviderStreamEvent::REASONING_DELTA, ['text' => $reasoning]);
            }
        }
        if (property_exists($delta, 'refusal') && $delta->refusal !== null) {
            $refusal = $this->boundedString($delta->refusal, 'OpenAI Chat refusal delta', 65_536, allowEmpty: true);
            if ($refusal !== '') {
                $this->refusal = $this->appendBounded($this->refusal, $refusal, self::MAX_REFUSAL_BYTES, 'OpenAI Chat streamed refusal');
            }
        }
        if (property_exists($delta, 'tool_calls')) {
            if (! is_array($delta->tool_calls)) {
                throw new UnexpectedValueException('OpenAI Chat stream tool_calls must be a list.');
            }
            foreach ($delta->tool_calls as $toolDelta) {
                $event = $this->decodeToolCallDelta($toolDelta);
                if ($event !== null) {
                    $events[] = $event;
                }
            }
        }

        return $events;
    }

    private function decodeToolCallDelta(mixed $value): ?ProviderStreamEvent
    {
        if (! $value instanceof stdClass || ! is_int($value->index ?? null) || $value->index < 0) {
            throw new UnexpectedValueException('OpenAI Chat streamed tool-call index must be non-negative.');
        }
        $index = $value->index;
        if ($index >= self::MAX_TOOL_CALLS || $index > count($this->toolCalls)) {
            throw new UnexpectedValueException('OpenAI Chat streamed tool-call indexes must be contiguous and bounded.');
        }
        if (! isset($this->toolCalls[$index])) {
            $this->toolCalls[$index] = [
                'id' => '',
                'type' => 'function',
                'function' => ['name' => '', 'arguments' => ''],
            ];
        }
        if (property_exists($value, 'type') && $value->type !== null && $value->type !== 'function') {
            throw new UnexpectedValueException('OpenAI Chat streamed tool-call type must be function.');
        }

        $idDelta = null;
        if (property_exists($value, 'id') && $value->id !== null) {
            $id = $this->boundedString($value->id, 'OpenAI Chat streamed tool-call ID', 256);
            $current = $this->toolCalls[$index]['id'];
            if ($current !== '' && $current !== $id) {
                throw new UnexpectedValueException('OpenAI Chat streamed tool-call ID changed mid-stream.');
            }
            if ($current === '') {
                $this->toolCalls[$index]['id'] = $id;
                $idDelta = $id;
            }
        }

        $nameDelta = null;
        $argumentsDelta = null;
        if (property_exists($value, 'function')) {
            if (! $value->function instanceof stdClass) {
                throw new UnexpectedValueException('OpenAI Chat streamed tool-call function must be an object.');
            }
            if (property_exists($value->function, 'name') && $value->function->name !== null) {
                $nameDelta = $this->boundedString($value->function->name, 'OpenAI Chat streamed tool-call name', 128, allowEmpty: true);
                if ($nameDelta !== '') {
                    $this->toolCalls[$index]['function']['name'] = $this->appendBounded(
                        $this->toolCalls[$index]['function']['name'],
                        $nameDelta,
                        128,
                        'OpenAI Chat streamed tool-call name',
                    );
                } else {
                    $nameDelta = null;
                }
            }
            if (property_exists($value->function, 'arguments') && $value->function->arguments !== null) {
                $argumentsDelta = $this->boundedString($value->function->arguments, 'OpenAI Chat streamed tool-call arguments', 65_536, allowEmpty: true);
                if ($argumentsDelta !== '') {
                    $this->toolCalls[$index]['function']['arguments'] = $this->appendBounded(
                        $this->toolCalls[$index]['function']['arguments'],
                        $argumentsDelta,
                        self::MAX_TOOL_ARGUMENT_BYTES,
                        'OpenAI Chat streamed tool-call arguments',
                    );
                } else {
                    $argumentsDelta = null;
                }
            }
        }

        if ($idDelta === null && $nameDelta === null && $argumentsDelta === null) {
            return null;
        }

        return $this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
            'index' => $index,
            'provider_call_id' => $idDelta,
            'name' => $nameDelta,
            'arguments_delta' => $argumentsDelta,
        ]);
    }

    private function acceptFinishReason(mixed $value): void
    {
        if ($value === null) {
            return;
        }
        $reason = $this->boundedString($value, 'OpenAI Chat finish reason', 256);
        if ($this->finishReason !== null && $this->finishReason !== $reason) {
            throw new UnexpectedValueException('OpenAI Chat finish reason changed mid-stream.');
        }
        $this->finishReason = $reason;
    }

    /** @return list<array{id: string, type: string, function: array{name: string, arguments: string}}> */
    private function completedToolCalls(): array
    {
        $calls = [];
        foreach ($this->toolCalls as $index => $call) {
            if ($call['id'] === '' || $call['function']['name'] === '' || $call['function']['arguments'] === '') {
                throw new UnexpectedValueException(sprintf('OpenAI Chat streamed tool call %d is incomplete.', $index));
            }
            $calls[] = $call;
        }

        return $calls;
    }

    /** @param array<string, mixed> $payload */
    private function event(string $kind, array $payload): ProviderStreamEvent
    {
        $this->sequence++;

        return new ProviderStreamEvent($kind, $this->sequence, $payload);
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
