<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use JsonException;
use stdClass;

final readonly class TalosMachineOutputContract
{
    public const ENVELOPE_KEY = 'talos_output';
    public const ROOT_ARRAY = 'array';
    public const ROOT_OBJECT = 'object';
    public const ROOT_VALUE = 'value';

    private const MAX_PROMPT_BYTES = 262144;
    private const MAX_OUTPUT_BYTES = 262144;

    private function __construct(private string $rootType) {}

    public static function fromPrompt(string $prompt): ?self
    {
        if (strlen($prompt) > self::MAX_PROMPT_BYTES) {
            throw new InvalidArgumentException('Machine-output prompt exceeds its byte budget.');
        }

        $normalized = preg_replace('/\s+/u', ' ', mb_strtolower(trim($prompt), 'UTF-8'));
        if (! is_string($normalized) || $normalized === '' || ! str_contains($normalized, 'json')) {
            return null;
        }

        $exclusive = false;
        foreach ([
            'solo json',
            'solo un array json',
            'solo una lista json',
            'solo un oggetto json',
            'non aggiungere testo',
            'senza testo',
            'nessuna spiegazione',
            'soltanto json',
            'soltanto un array json',
            'soltanto una lista json',
            'soltanto un oggetto json',
            'esclusivamente json',
            'esclusivamente un array json',
            'esclusivamente una lista json',
            'esclusivamente un oggetto json',
            'unicamente json',
            'unicamente un array json',
            'unicamente una lista json',
            'unicamente un oggetto json',
            'json soltanto',
            'json esclusivamente',
            'only json',
            'only a json array',
            'only a json object',
            'only a json value',
            'json only',
            'exclusively json',
            'exclusively a json array',
            'exclusively a json object',
            'exclusively a json value',
            'without prose',
            'no prose',
        ] as $marker) {
            if (str_contains($normalized, $marker)) {
                $exclusive = true;
                break;
            }
        }
        if (! $exclusive) {
            return null;
        }

        foreach (['array json', 'json array', 'lista json', 'json list'] as $arrayMarker) {
            if (str_contains($normalized, $arrayMarker)) {
                return new self(self::ROOT_ARRAY);
            }
        }
        foreach (['oggetto json', 'json object'] as $objectMarker) {
            if (str_contains($normalized, $objectMarker)) {
                return new self(self::ROOT_OBJECT);
            }
        }

        return new self(self::ROOT_VALUE);
    }

    public function responseMimeType(): string
    {
        return 'application/json';
    }

    public function systemInstruction(): string
    {
        $example = match ($this->rootType) {
            self::ROOT_ARRAY => '{"talos_output":[]}',
            self::ROOT_OBJECT => '{"talos_output":{}}',
            default => '{"talos_output":null}',
        };
        $requestedType = match ($this->rootType) {
            self::ROOT_ARRAY => 'JSON array',
            self::ROOT_OBJECT => 'JSON object',
            default => 'requested JSON value',
        };

        return sprintf(
            'For the final answer, return exactly one JSON object shaped as %s. Keep the key literally named "talos_output" and replace only its example value with the requested %s. Keep "talos_output" as the only object member. Return valid JSON only: no prose, markdown, or code fences.',
            $example,
            $requestedType,
        );
    }

    public function release(string $providerText): string
    {
        if ($providerText === '' || strlen($providerText) > self::MAX_OUTPUT_BYTES) {
            throw new InvalidArgumentException('Provider machine output is empty or exceeds its byte budget.');
        }

        try {
            $envelope = json_decode($providerText, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Provider machine output is not valid JSON.', previous: $exception);
        }
        if (! $envelope instanceof stdClass) {
            throw new InvalidArgumentException('Provider machine output must use the required object envelope.');
        }

        $members = get_object_vars($envelope);
        if (array_keys($members) !== [self::ENVELOPE_KEY]) {
            throw new InvalidArgumentException('Provider machine output must contain exactly the required envelope member.');
        }
        $value = $members[self::ENVELOPE_KEY];
        if ($this->rootType === self::ROOT_ARRAY && (! is_array($value) || ! array_is_list($value))) {
            throw new InvalidArgumentException('Provider machine output does not contain the requested JSON array.');
        }
        if ($this->rootType === self::ROOT_OBJECT && ! $value instanceof stdClass) {
            throw new InvalidArgumentException('Provider machine output does not contain the requested JSON object.');
        }

        try {
            return json_encode(
                $value,
                JSON_UNESCAPED_SLASHES
                    | JSON_UNESCAPED_UNICODE
                    | JSON_PRESERVE_ZERO_FRACTION
                    | JSON_THROW_ON_ERROR,
            );
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Provider machine output could not be encoded canonically.', previous: $exception);
        }
    }
}
