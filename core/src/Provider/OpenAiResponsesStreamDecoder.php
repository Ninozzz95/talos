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

final class OpenAiResponsesStreamDecoder implements ProviderStreamDecoder
{
    private readonly ProviderSseParser $parser;
    private int $sequence = 0;
    private bool $terminalSeen = false;
    private bool $finalized = false;
    private ?string $responseId = null;
    /** @var array<string, mixed>|null */
    private ?array $terminalResponse = null;
    /** @var array<int, array{item_id: string, call_id: string, name: string}> */
    private array $functionCalls = [];

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
            throw new LogicException('OpenAI Responses stream decoder is already finalized.');
        }

        $events = [];
        foreach ($this->parser->push($chunk) as $record) {
            if ($this->terminalSeen) {
                throw new UnexpectedValueException('OpenAI Responses stream contained data after its terminal event.');
            }
            array_push($events, ...$this->decodeRecord($record));
        }

        return $events;
    }

    public function finish(): ProviderTurnResponse
    {
        if ($this->finalized) {
            throw new LogicException('OpenAI Responses stream decoder cannot be finalized twice.');
        }
        $this->parser->finish();
        if (! $this->terminalSeen || $this->terminalResponse === null) {
            throw new UnexpectedValueException('OpenAI Responses stream ended without an official terminal response.');
        }
        $this->finalized = true;

        $outcome = ($this->finalizer)($this->terminalResponse);
        if (! $outcome instanceof ProviderTurnResponse) {
            throw new UnexpectedValueException('OpenAI Responses finalizer returned an invalid provider outcome.');
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
            throw new UnexpectedValueException('OpenAI Responses stream contained invalid JSON.', previous: $exception);
        }
        if (! $payload instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Responses stream payloads must be JSON objects.');
        }

        $type = $this->boundedString($payload->type ?? null, 'OpenAI Responses event type', 128);
        if ($record['event'] !== 'message' && $record['event'] !== $type) {
            throw new UnexpectedValueException('OpenAI Responses SSE event name does not match its payload type.');
        }
        if (property_exists($payload, 'response_id')) {
            $this->acceptResponseId($payload->response_id);
        }
        if ($type === 'error') {
            throw new UnexpectedValueException('OpenAI Responses stream emitted a provider error event.');
        }

        return match ($type) {
            'response.created', 'response.in_progress', 'response.queued'
                => $this->acceptLifecycleResponse($payload),
            'response.output_item.added'
                => $this->acceptOutputItem($payload),
            'response.output_text.delta'
                => $this->textDelta($payload, ProviderStreamEvent::TEXT_DELTA, 'delta'),
            'response.reasoning_summary_text.delta'
                => $this->textDelta($payload, ProviderStreamEvent::REASONING_DELTA, 'delta'),
            'response.function_call_arguments.delta'
                => $this->functionArgumentsDelta($payload),
            'response.completed', 'response.incomplete', 'response.failed', 'response.cancelled'
                => $this->acceptTerminalResponse($type, $payload),
            default => [],
        };
    }

    /** @return list<ProviderStreamEvent> */
    private function acceptLifecycleResponse(stdClass $payload): array
    {
        if (! ($payload->response ?? null) instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Responses lifecycle event must contain a response object.');
        }
        $this->acceptResponseId($payload->response->id ?? null);

        return [];
    }

    /** @return list<ProviderStreamEvent> */
    private function acceptOutputItem(stdClass $payload): array
    {
        $outputIndex = $this->nonNegativeInt($payload->output_index ?? null, 'OpenAI Responses output index');
        $item = $payload->item ?? null;
        if (! $item instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Responses output item must be an object.');
        }
        if (($item->type ?? null) !== 'function_call') {
            return [];
        }
        if (isset($this->functionCalls[$outputIndex])) {
            throw new UnexpectedValueException('OpenAI Responses function-call output index was reused.');
        }

        $identity = [
            'item_id' => $this->boundedString($item->id ?? null, 'OpenAI Responses function item ID', 256),
            'call_id' => $this->boundedString($item->call_id ?? null, 'OpenAI Responses function call ID', 256),
            'name' => $this->boundedString($item->name ?? null, 'OpenAI Responses function name', 128),
        ];
        $this->functionCalls[$outputIndex] = $identity;

        return [$this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
            'index' => $outputIndex,
            'provider_call_id' => $identity['call_id'],
            'name' => $identity['name'],
            'arguments_delta' => null,
        ])];
    }

    /** @return list<ProviderStreamEvent> */
    private function textDelta(stdClass $payload, string $kind, string $field): array
    {
        $this->nonNegativeInt($payload->output_index ?? null, 'OpenAI Responses output index');
        $delta = $this->boundedString($payload->{$field} ?? null, 'OpenAI Responses text delta', 65_536, allowEmpty: true);
        if ($delta === '') {
            return [];
        }

        return [$this->event($kind, ['text' => $delta])];
    }

    /** @return list<ProviderStreamEvent> */
    private function functionArgumentsDelta(stdClass $payload): array
    {
        $outputIndex = $this->nonNegativeInt($payload->output_index ?? null, 'OpenAI Responses function output index');
        $identity = $this->functionCalls[$outputIndex] ?? null;
        if ($identity === null) {
            throw new UnexpectedValueException('OpenAI Responses function arguments arrived before tool identity.');
        }
        $itemId = $this->boundedString($payload->item_id ?? null, 'OpenAI Responses function item ID', 256);
        if ($itemId !== $identity['item_id']) {
            throw new UnexpectedValueException('OpenAI Responses function item ID changed mid-stream.');
        }
        $delta = $this->boundedString($payload->delta ?? null, 'OpenAI Responses function arguments delta', 65_536, allowEmpty: true);
        if ($delta === '') {
            return [];
        }

        return [$this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
            'index' => $outputIndex,
            'provider_call_id' => null,
            'name' => null,
            'arguments_delta' => $delta,
        ])];
    }

    /** @return list<ProviderStreamEvent> */
    private function acceptTerminalResponse(string $type, stdClass $payload): array
    {
        $response = $payload->response ?? null;
        if (! $response instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Responses terminal event must contain a response object.');
        }
        $this->acceptResponseId($response->id ?? null);
        $expectedStatus = substr($type, strlen('response.'));
        if (($response->status ?? null) !== $expectedStatus) {
            throw new UnexpectedValueException('OpenAI Responses terminal status does not match its event type.');
        }

        $this->terminalResponse = $this->objectToArray($response);
        $this->terminalSeen = true;
        if (! property_exists($response, 'usage') || $response->usage === null) {
            return [];
        }
        if (! $response->usage instanceof stdClass) {
            throw new UnexpectedValueException('OpenAI Responses terminal usage must be an object.');
        }
        $usage = TokenUsage::fromOpenAiResponses($this->objectToArray($response->usage));

        return [$this->event(ProviderStreamEvent::USAGE, $usage->toArray())];
    }

    private function acceptResponseId(mixed $value): void
    {
        $id = $this->boundedString($value, 'OpenAI Responses response ID', 256);
        if ($this->responseId !== null && $this->responseId !== $id) {
            throw new UnexpectedValueException('OpenAI Responses response ID changed mid-stream.');
        }
        $this->responseId = $id;
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
