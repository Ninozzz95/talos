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

final class GeminiStreamDecoder implements ProviderStreamDecoder
{
    private const MAX_TEXT_BYTES = 1_048_576;

    private readonly ProviderSseParser $parser;
    private int $sequence = 0;
    private bool $seenChunk = false;
    private bool $candidateSeen = false;
    private bool $finalized = false;
    private ?string $responseId = null;
    private ?string $modelVersion = null;
    private ?string $finishReason = null;
    /** @var list<array<string, mixed>> */
    private array $parts = [];
    /** @var array<string, mixed> */
    private array $candidateFields = [];
    /** @var array<string, mixed>|null */
    private ?array $usageMetadata = null;
    /** @var array<string, mixed>|null */
    private ?array $promptFeedback = null;

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
            throw new LogicException('Gemini stream decoder is already finalized.');
        }

        $events = [];
        foreach ($this->parser->push($chunk) as $record) {
            if ($record['event'] !== 'message') {
                throw new UnexpectedValueException('Gemini stream used an unsupported SSE event name.');
            }
            array_push($events, ...$this->decodeRecord($record['data']));
        }

        return $events;
    }

    public function finish(): ProviderTurnResponse
    {
        if ($this->finalized) {
            throw new LogicException('Gemini stream decoder cannot be finalized twice.');
        }
        $this->parser->finish();
        if (! $this->seenChunk) {
            throw new UnexpectedValueException('Gemini stream ended without a GenerateContentResponse.');
        }
        $this->finalized = true;

        $response = [];
        if ($this->responseId !== null) {
            $response['responseId'] = $this->responseId;
        }
        if ($this->modelVersion !== null) {
            $response['modelVersion'] = $this->modelVersion;
        }
        $response['candidates'] = [];
        if ($this->candidateSeen) {
            $candidate = [
                'index' => 0,
                ...$this->candidateFields,
                'content' => [
                    'role' => 'model',
                    'parts' => $this->parts,
                ],
            ];
            if ($this->finishReason !== null) {
                $candidate['finishReason'] = $this->finishReason;
            }
            $response['candidates'][] = $candidate;
        }
        if ($this->usageMetadata !== null) {
            $response['usageMetadata'] = $this->usageMetadata;
        }
        if ($this->promptFeedback !== null) {
            $response['promptFeedback'] = $this->promptFeedback;
        }

        $outcome = ($this->finalizer)($response);
        if (! $outcome instanceof ProviderTurnResponse) {
            throw new UnexpectedValueException('Gemini finalizer returned an invalid provider outcome.');
        }

        return $outcome;
    }

    /** @return list<ProviderStreamEvent> */
    private function decodeRecord(string $data): array
    {
        try {
            $chunk = json_decode($data, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('Gemini stream contained invalid JSON.', previous: $exception);
        }
        if (! $chunk instanceof stdClass) {
            throw new UnexpectedValueException('Gemini stream chunks must be JSON objects.');
        }
        $this->seenChunk = true;

        if (property_exists($chunk, 'responseId')) {
            $this->responseId = $this->stableString(
                $this->responseId,
                $chunk->responseId,
                'Gemini response ID',
                256,
            );
        }
        if (property_exists($chunk, 'modelVersion')) {
            $this->modelVersion = $this->stableString(
                $this->modelVersion,
                $chunk->modelVersion,
                'Gemini model version',
                256,
            );
        }
        if (property_exists($chunk, 'promptFeedback')) {
            if (! $chunk->promptFeedback instanceof stdClass) {
                throw new UnexpectedValueException('Gemini prompt feedback must be an object.');
            }
            $this->promptFeedback = $this->objectToArray($chunk->promptFeedback);
        }
        if (! property_exists($chunk, 'candidates') || ! is_array($chunk->candidates)) {
            throw new UnexpectedValueException('Gemini candidates must be a list.');
        }
        if (count($chunk->candidates) > 1) {
            throw new UnexpectedValueException('Gemini stream must contain at most one candidate per chunk.');
        }

        $events = [];
        if ($chunk->candidates !== []) {
            array_push($events, ...$this->acceptCandidate($chunk->candidates[0]));
        }
        if (property_exists($chunk, 'usageMetadata')) {
            if (! $chunk->usageMetadata instanceof stdClass) {
                throw new UnexpectedValueException('Gemini usage metadata must be an object.');
            }
            $this->usageMetadata = $this->objectToArray($chunk->usageMetadata);
            $usage = TokenUsage::fromGemini($this->usageMetadata);
            $events[] = $this->event(ProviderStreamEvent::USAGE, $usage->toArray());
        }

        return $events;
    }

    /** @return list<ProviderStreamEvent> */
    private function acceptCandidate(mixed $value): array
    {
        if (! $value instanceof stdClass) {
            throw new UnexpectedValueException('Gemini candidate must be an object.');
        }
        if (property_exists($value, 'index')
            && (! is_int($value->index) || $value->index !== 0)) {
            throw new UnexpectedValueException('Gemini stream candidate index must be zero.');
        }
        $this->candidateSeen = true;

        foreach (get_object_vars($value) as $key => $field) {
            if (in_array($key, ['index', 'content', 'finishReason'], true)) {
                continue;
            }
            $this->candidateFields[$key] = $this->jsonValueToArray($field);
        }
        if (property_exists($value, 'finishReason') && $value->finishReason !== null) {
            $reason = $this->boundedString($value->finishReason, 'Gemini finish reason', 128);
            if ($this->finishReason !== null && $this->finishReason !== $reason) {
                throw new UnexpectedValueException('Gemini finish reason changed mid-stream.');
            }
            $this->finishReason = $reason;
        }
        if (! property_exists($value, 'content')) {
            return [];
        }
        $content = $value->content;
        if (! $content instanceof stdClass
            || ($content->role ?? null) !== 'model'
            || ! is_array($content->parts ?? null)) {
            throw new UnexpectedValueException('Gemini candidate content must contain model parts.');
        }

        $events = [];
        foreach ($content->parts as $part) {
            array_push($events, ...$this->acceptPart($part));
        }

        return $events;
    }

    /** @return list<ProviderStreamEvent> */
    private function acceptPart(mixed $value): array
    {
        if (! $value instanceof stdClass) {
            throw new UnexpectedValueException('Gemini candidate parts must be objects.');
        }

        if (property_exists($value, 'text')) {
            $text = $this->boundedString($value->text, 'Gemini text part', 65_536, allowEmpty: true);
            $thought = property_exists($value, 'thought') ? $value->thought : false;
            if (! is_bool($thought)) {
                throw new UnexpectedValueException('Gemini thought marker must be boolean.');
            }
            $signature = null;
            if (property_exists($value, 'thoughtSignature')) {
                $signature = $this->boundedString($value->thoughtSignature, 'Gemini thought signature', 262_144, allowEmpty: true);
            }
            $this->appendTextPart($text, $thought, $signature);
            if ($text === '') {
                return [];
            }

            return [$this->event(
                $thought ? ProviderStreamEvent::REASONING_DELTA : ProviderStreamEvent::TEXT_DELTA,
                ['text' => $text],
            )];
        }

        if (property_exists($value, 'functionCall')) {
            $function = $value->functionCall;
            if (! $function instanceof stdClass || ! ($function->args ?? null) instanceof stdClass) {
                throw new UnexpectedValueException('Gemini functionCall and args must be objects.');
            }
            $nativePart = $this->objectToArray($value);
            $partIndex = count($this->parts);
            $this->parts[] = $nativePart;
            $name = $this->boundedString($function->name ?? null, 'Gemini function name', 128);
            $callId = property_exists($function, 'id') && $function->id !== null
                ? $this->boundedString($function->id, 'Gemini function call ID', 256)
                : sprintf(
                    'gemini:%s:%d',
                    $this->responseId ?? hash('sha256', json_encode($nativePart, JSON_THROW_ON_ERROR)),
                    $partIndex,
                );
            $arguments = json_encode($function->args, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if (strlen($arguments) > 262_144) {
                throw new UnexpectedValueException('Gemini function arguments exceeded their byte limit.');
            }

            return [$this->event(ProviderStreamEvent::TOOL_CALL_DELTA, [
                'index' => $partIndex,
                'provider_call_id' => $callId,
                'name' => $name,
                'arguments_delta' => $arguments,
            ])];
        }

        $this->parts[] = $this->objectToArray($value);

        return [];
    }

    private function appendTextPart(string $text, bool $thought, ?string $signature): void
    {
        $lastIndex = array_key_last($this->parts);
        $canMerge = $lastIndex !== null
            && array_key_exists('text', $this->parts[$lastIndex])
            && (($this->parts[$lastIndex]['thought'] ?? false) === $thought)
            && ! array_key_exists('functionCall', $this->parts[$lastIndex]);
        if (! $canMerge) {
            $part = ['text' => $text];
            if ($thought) {
                $part['thought'] = true;
            }
            if ($signature !== null) {
                $part['thoughtSignature'] = $signature;
            }
            $this->parts[] = $part;

            return;
        }

        $current = (string) $this->parts[$lastIndex]['text'];
        if (strlen($current) + strlen($text) > self::MAX_TEXT_BYTES) {
            throw new UnexpectedValueException('Gemini coalesced text exceeded its byte limit.');
        }
        $this->parts[$lastIndex]['text'] = $current.$text;
        if ($signature !== null) {
            $existing = $this->parts[$lastIndex]['thoughtSignature'] ?? null;
            if ($existing !== null && $existing !== '' && $existing !== $signature) {
                throw new UnexpectedValueException('Gemini thought signature changed mid-part.');
            }
            $this->parts[$lastIndex]['thoughtSignature'] = $signature;
        }
    }

    /** @param array<string, mixed> $payload */
    private function event(string $kind, array $payload): ProviderStreamEvent
    {
        $this->sequence++;

        return new ProviderStreamEvent($kind, $this->sequence, $payload);
    }

    private function stableString(?string $current, mixed $value, string $label, int $limit): string
    {
        $next = $this->boundedString($value, $label, $limit);
        if ($current !== null && $current !== $next) {
            throw new UnexpectedValueException("{$label} changed mid-stream.");
        }

        return $next;
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
