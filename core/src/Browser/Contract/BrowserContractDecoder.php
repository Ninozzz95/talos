<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

use InvalidArgumentException;
use JsonException;
use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Errors\ErrorFormatter;
use stdClass;

final class BrowserContractDecoder
{
    /** @var array<string, stdClass> */
    private static array $schemas = [];

    /** @return array<string, mixed> */
    public static function decode(string $json, string $schemaName, string $label): array
    {
        try {
            $decoded = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException("{$label} JSON is malformed.", previous: $exception);
        }

        if (! $decoded instanceof stdClass) {
            throw new InvalidArgumentException("{$label} JSON root must be an object.");
        }

        $result = (new CompliantValidator)->validate($decoded, self::schema($schemaName));
        if (! $result->isValid()) {
            $message = 'does not satisfy its canonical schema';
            if ($result->error() !== null) {
                $formatted = trim((new ErrorFormatter)->formatErrorMessage($result->error()));
                if ($formatted !== '') {
                    $message .= ': '.(strlen($formatted) <= 512 ? $formatted : substr($formatted, 0, 509).'...');
                }
            }

            throw new InvalidArgumentException("{$label} {$message}.");
        }

        /** @var array<string, mixed> $value */
        $value = self::toPhpValue($decoded);

        return $value;
    }

    /**
     * @param array<string, mixed> $value
     * @param list<string> $objectFields
     * @param list<string> $objectListFields
     */
    public static function encodeServerArray(array $value, array $objectFields = [], array $objectListFields = []): string
    {
        foreach ($objectFields as $field) {
            if (array_key_exists($field, $value) && is_array($value[$field])) {
                $value[$field] = (object) $value[$field];
            }
        }
        foreach ($objectListFields as $field) {
            if (! array_key_exists($field, $value) || ! is_array($value[$field]) || ! array_is_list($value[$field])) {
                continue;
            }
            $value[$field] = array_map(
                static fn (mixed $item): mixed => is_array($item) ? (object) $item : $item,
                $value[$field],
            );
        }

        try {
            return json_encode((object) $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Server-constructed Browser contract contains non-JSON values.', previous: $exception);
        }
    }

    private static function schema(string $schemaName): stdClass
    {
        if (preg_match('/\A[a-z0-9-]+\z/D', $schemaName) !== 1) {
            throw new InvalidArgumentException('Browser contract schema name is invalid.');
        }
        if (isset(self::$schemas[$schemaName])) {
            return self::$schemas[$schemaName];
        }

        $root = dirname(__DIR__, 3).'/resources/schema/browser/v1';
        $path = $root.'/'.$schemaName.'.schema.json';
        $contents = file_get_contents($path);
        if (! is_string($contents)) {
            throw new InvalidArgumentException("Browser contract schema {$schemaName} is unavailable.");
        }

        try {
            $schema = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException("Browser contract schema {$schemaName} is malformed.", previous: $exception);
        }
        if (! $schema instanceof stdClass) {
            throw new InvalidArgumentException("Browser contract schema {$schemaName} root must be an object.");
        }

        return self::$schemas[$schemaName] = $schema;
    }

    private static function toPhpValue(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            return array_map(self::toPhpValue(...), get_object_vars($value));
        }
        if (is_array($value)) {
            return array_map(self::toPhpValue(...), $value);
        }

        return $value;
    }
}
