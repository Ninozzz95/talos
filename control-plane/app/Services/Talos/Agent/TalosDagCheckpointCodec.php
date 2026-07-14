<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use JsonException;
use Kadmos\Tool\ToolResult;
use stdClass;

final class TalosDagCheckpointCodec
{
    public static function encode(array $state): string
    {
        try {
            return json_encode(
                self::encodeValue($state),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
            );
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('DAG checkpoint is not JSON-compatible.', previous: $exception);
        }
    }

    /** @return array<string, mixed> */
    public static function decode(string $encoded): array
    {
        try {
            $wire = json_decode($encoded, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('DAG checkpoint JSON is malformed.', previous: $exception);
        }

        $state = self::decodeValue($wire);
        if (! is_array($state) || ($state !== [] && array_is_list($state))) {
            throw new InvalidArgumentException('DAG checkpoint root must be an object-shaped state map.');
        }

        return $state;
    }

    private static function encodeValue(mixed $value): mixed
    {
        if ($value instanceof ToolResult) {
            return [
                '@talos_type' => 'tool_result',
                'value' => self::encodeValue($value->toWireArray()),
            ];
        }
        if ($value instanceof stdClass) {
            return [
                '@talos_type' => 'object',
                'value' => self::encodeMap(get_object_vars($value)),
            ];
        }
        if (is_array($value)) {
            return [
                '@talos_type' => array_is_list($value) ? 'list' : 'map',
                'value' => array_is_list($value)
                    ? array_map(self::encodeValue(...), $value)
                    : self::encodeMap($value),
            ];
        }
        if ($value === null || is_string($value) || is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        throw new InvalidArgumentException('DAG checkpoint contains an unsupported value.');
    }

    /** @param array<string, mixed> $value @return array<string, mixed> */
    private static function encodeMap(array $value): array
    {
        ksort($value, SORT_STRING);

        return array_map(self::encodeValue(...), $value);
    }

    private static function decodeValue(mixed $wire): mixed
    {
        if ($wire === null || is_string($wire) || is_bool($wire) || is_int($wire) || is_float($wire)) {
            return $wire;
        }
        if (! is_array($wire)
            || array_keys($wire) !== ['@talos_type', 'value']
            || ! is_string($wire['@talos_type'])) {
            throw new InvalidArgumentException('DAG checkpoint value is not type-tagged.');
        }

        return match ($wire['@talos_type']) {
            'list' => self::decodeList($wire['value']),
            'map' => self::decodeMap($wire['value']),
            'object' => self::decodeObject($wire['value']),
            'tool_result' => self::decodeToolResult($wire['value']),
            default => throw new InvalidArgumentException('DAG checkpoint value uses an unsupported type tag.'),
        };
    }

    /** @return list<mixed> */
    private static function decodeList(mixed $wire): array
    {
        if (! is_array($wire) || ! array_is_list($wire)) {
            throw new InvalidArgumentException('DAG checkpoint list payload is invalid.');
        }

        return array_map(self::decodeValue(...), $wire);
    }

    /** @return array<string, mixed> */
    private static function decodeMap(mixed $wire): array
    {
        if (! is_array($wire) || ($wire !== [] && array_is_list($wire))) {
            throw new InvalidArgumentException('DAG checkpoint map payload is invalid.');
        }

        return array_map(self::decodeValue(...), $wire);
    }

    private static function decodeObject(mixed $wire): stdClass
    {
        $value = self::decodeMap($wire);
        $object = new stdClass;
        foreach ($value as $key => $item) {
            $object->{$key} = $item;
        }

        return $object;
    }

    private static function decodeToolResult(mixed $wire): ToolResult
    {
        $value = self::decodeValue($wire);
        if (! is_array($value) || ! is_string($value['tool_use_id'] ?? null)) {
            throw new InvalidArgumentException('DAG checkpoint tool result payload is invalid.');
        }

        return ToolResult::fromArray($value, $value['tool_use_id']);
    }
}
