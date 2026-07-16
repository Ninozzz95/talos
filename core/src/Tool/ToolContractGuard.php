<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use JsonException;

final class ToolContractGuard
{
    /**
     * @param array<string, mixed> $value
     * @param list<string> $required
     * @param list<string> $optional
     */
    public static function exactKeys(array $value, array $required, array $optional, string $label): void
    {
        $allowed = [...$required, ...$optional];
        $unknown = array_values(array_diff(array_keys($value), $allowed));
        if ($unknown !== []) {
            throw new InvalidArgumentException(sprintf('%s contains unknown fields: %s.', $label, implode(', ', $unknown)));
        }

        $missing = array_values(array_filter(
            $required,
            static fn (string $key): bool => ! array_key_exists($key, $value),
        ));
        if ($missing !== []) {
            throw new InvalidArgumentException(sprintf('%s is missing required fields: %s.', $label, implode(', ', $missing)));
        }
    }

    public static function nonEmptyString(mixed $value, string $label, int $maxLength = 4096): string
    {
        if (! is_string($value) || self::isUnicodeWhitespaceOnly($value) || strlen($value) > $maxLength) {
            throw new InvalidArgumentException(sprintf('%s must be a non-empty string of at most %d bytes.', $label, $maxLength));
        }

        return $value;
    }

    public static function boundedString(mixed $value, string $label, int $maxLength = 4096): string
    {
        if (! is_string($value) || strlen($value) > $maxLength) {
            throw new InvalidArgumentException(sprintf('%s must be a string of at most %d bytes.', $label, $maxLength));
        }

        return $value;
    }

    public static function nullableString(mixed $value, string $label, int $maxLength = 8192): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_string($value) || strlen($value) > $maxLength) {
            throw new InvalidArgumentException(sprintf('%s must be null or a string of at most %d bytes.', $label, $maxLength));
        }

        return $value;
    }

    /** @return array<string, mixed> */
    public static function objectArray(mixed $value, string $label): array
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new InvalidArgumentException(sprintf('%s must be an object-shaped array.', $label));
        }

        return $value;
    }

    /** @return list<mixed> */
    public static function listArray(mixed $value, string $label): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            throw new InvalidArgumentException(sprintf('%s must be a list.', $label));
        }

        return $value;
    }

    /** @return list<mixed> */
    public static function boundedListArray(mixed $value, string $label, int $maxItems): array
    {
        $list = self::listArray($value, $label);
        if (count($list) > $maxItems) {
            throw new InvalidArgumentException(sprintf('%s must contain at most %d items.', $label, $maxItems));
        }

        return $list;
    }

    public static function boolean(mixed $value, string $label): bool
    {
        if (! is_bool($value)) {
            throw new InvalidArgumentException(sprintf('%s must be a boolean.', $label));
        }

        return $value;
    }

    public static function nonNegativeInteger(mixed $value, string $label): int
    {
        if (is_int($value)) {
            if ($value < 0) {
                throw new InvalidArgumentException(sprintf('%s must be a non-negative integer.', $label));
            }

            return $value;
        }

        if (! is_float($value) || ! is_finite($value) || $value < 0 || floor($value) !== $value) {
            throw new InvalidArgumentException(sprintf('%s must be a non-negative integer.', $label));
        }

        return (int) $value;
    }

    public static function jsonSafeNonNegativeInteger(mixed $value, string $label): int
    {
        $integer = self::nonNegativeInteger($value, $label);
        if ($integer > 9007199254740991) {
            throw new InvalidArgumentException(sprintf('%s must be a JSON-safe integer.', $label));
        }

        return $integer;
    }

    public static function iso8601(mixed $value, string $label): string
    {
        $timestamp = self::nonEmptyString($value, $label, 64);
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $timestamp) !== 1) {
            throw new InvalidArgumentException(sprintf('%s must be a valid ISO-8601 timestamp.', $label));
        }
        $parts = date_parse($timestamp);
        if (($parts['error_count'] ?? 1) !== 0 || ($parts['warning_count'] ?? 1) !== 0) {
            throw new InvalidArgumentException(sprintf('%s must be a valid ISO-8601 timestamp.', $label));
        }

        return $timestamp;
    }

    public static function sha256(mixed $value, string $label): string
    {
        if (! is_string($value) || preg_match('/^sha256:[a-f0-9]{64}$/D', $value) !== 1) {
            throw new InvalidArgumentException(sprintf('%s must be a lowercase sha256 digest.', $label));
        }

        return $value;
    }

    public static function jsonValue(mixed $value, string $label): mixed
    {
        if (is_object($value) || is_resource($value)) {
            throw new InvalidArgumentException(sprintf('%s must contain JSON-compatible values only.', $label));
        }

        try {
            json_encode($value, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException(sprintf('%s must contain JSON-compatible values only.', $label));
        }

        return $value;
    }

    /** @return array<string, mixed>|\stdClass */
    public static function canonicalObjectArray(array $value): array|\stdClass
    {
        return $value === [] ? new \stdClass() : $value;
    }

    /** @return list<array<string, mixed>> */
    public static function mcpIconList(mixed $value, string $label, int $maxItems): array
    {
        $icons = self::boundedListArray($value, $label, $maxItems);
        foreach ($icons as $index => $icon) {
            $icon = self::objectArray($icon, sprintf('%s item %d', $label, $index));
            self::exactKeys($icon, ['src'], ['mimeType', 'sizes', 'theme'], sprintf('%s item %d', $label, $index));
            $src = self::nonEmptyString($icon['src'], sprintf('%s item %d src', $label, $index), 2048);
            if (preg_match('/\A(?:https?:\/\/|data:)[^\s]+\z/iu', $src) !== 1) {
                throw new InvalidArgumentException(sprintf('%s item %d src must be an HTTP(S) or data URI.', $label, $index));
            }
            if (array_key_exists('mimeType', $icon)) {
                self::nonEmptyString($icon['mimeType'], sprintf('%s item %d mimeType', $label, $index), 128);
            }
            if (array_key_exists('sizes', $icon)) {
                foreach (self::boundedListArray($icon['sizes'], sprintf('%s item %d sizes', $label, $index), 16) as $size) {
                    $size = self::nonEmptyString($size, sprintf('%s item %d size', $label, $index), 32);
                    if (preg_match('/^(?:any|\d+x\d+)$/D', $size) !== 1) {
                        throw new InvalidArgumentException(sprintf('%s item %d size is invalid.', $label, $index));
                    }
                }
            }
            if (array_key_exists('theme', $icon)
                && (! is_string($icon['theme']) || ! in_array($icon['theme'], ['light', 'dark'], true))) {
                throw new InvalidArgumentException(sprintf('%s item %d theme must be light or dark.', $label, $index));
            }
        }

        return $icons;
    }

    /** @param array<string, mixed>|list<mixed> $value @return array<string, mixed>|list<mixed> */
    public static function redact(array $value): array
    {
        $redacted = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && self::isSensitiveKey($key)) {
                $redacted[$key] = '[REDACTED]';
                continue;
            }

            $redacted[$key] = is_array($item)
                ? self::redact($item)
                : (is_string($item) ? self::redactString($item) : $item);
        }

        return $redacted;
    }

    private static function isSensitiveKey(string $key): bool
    {
        $snake = preg_match('/^[A-Z0-9_.-]+$/D', $key) === 1
            ? $key
            : preg_replace('/(?<!^)[A-Z]/', '_$0', $key);
        $normalized = strtolower(str_replace(['-', '.'], '_', is_string($snake) ? $snake : $key));
        if (in_array($normalized, [
            'secret',
            'token',
            'password',
            'api_key',
            'authorization',
            'cookie',
            'access_token',
            'refresh_token',
            'client_secret',
            'private_key',
            'credential',
            'set_cookie',
            'connection_string',
            'database_url',
            'dsn',
            'storage_path',
            'local_path',
            'absolute_path',
            'filesystem_path',
            'file_path',
            'temporary_path',
            'private_path',
            'working_directory',
            'cwd',
        ], true)) {
            return true;
        }

        return preg_match('/_(?:secret|token|password|api_key|access_token|refresh_token|private_key|credential|cookie|connection_string|storage_path|local_path|absolute_path|filesystem_path|file_path|temporary_path|private_path)(?:_(?:b64|base64|pem|der))?$/D', $normalized) === 1;
    }

    private static function redactString(string $value): string
    {
        $value = preg_replace('/\b(Bearer\s+)[^\s,;]+/i', '$1[REDACTED]', $value) ?? $value;
        $value = preg_replace('/\bsk-[A-Za-z0-9_-]{12,}\b/', '[REDACTED]', $value) ?? $value;
        $value = preg_replace('/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/', '[REDACTED]', $value) ?? $value;
        $value = preg_replace('/(?<=:\/\/)[^\/@\s]+:[^\/@\s]+@/', '[REDACTED]@', $value) ?? $value;
        $value = preg_replace('~(?<![A-Za-z0-9])(?:[A-Za-z]:[\\\\/]|\\\\\\\\)[^\s"\'<>]+~', '[REDACTED]', $value) ?? $value;
        $value = preg_replace('~(?<![A-Za-z0-9:])/(?:home|Users|var|tmp|opt|srv|etc|root|mnt|private|app)(?:/[^\s"\'<>]*)?~i', '[REDACTED]', $value) ?? $value;

        return preg_replace_callback(
            '/([?&#])([^=&#\s]+)=([^&#\s]*)/',
            static function (array $match): string {
                if (! self::isSensitiveKey(rawurldecode($match[2]))) {
                    return $match[0];
                }

                return $match[1].$match[2].'='.rawurlencode('[REDACTED]');
            },
            $value,
        ) ?? $value;
    }

    private static function isUnicodeWhitespaceOnly(string $value): bool
    {
        return preg_match('/\A[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]*\z/u', $value) === 1;
    }
}
