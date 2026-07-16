<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

use BackedEnum;
use DateTimeImmutable;
use InvalidArgumentException;
use ValueError;

final class BrowserContractGuard
{
    /** @template T of BackedEnum @param class-string<T> $enum @return T */
    public static function enum(string $value, string $enum, string $label): BackedEnum
    {
        try {
            return $enum::from($value);
        } catch (ValueError $exception) {
            throw new InvalidArgumentException("{$label} is unsupported.", previous: $exception);
        }
    }

    /** @template T of BackedEnum @param list<string> $values @param class-string<T> $enum @return list<T> */
    public static function enumList(array $values, string $enum, string $label): array
    {
        return array_map(
            static fn (string $value): BackedEnum => self::enum($value, $enum, $label),
            $values,
        );
    }

    public static function require(bool $condition, string $message): void
    {
        if (! $condition) {
            throw new InvalidArgumentException($message);
        }
    }

    public static function timestamp(string $value, string $label): DateTimeImmutable
    {
        try {
            return new DateTimeImmutable($value);
        } catch (\Exception $exception) {
            throw new InvalidArgumentException("{$label} is invalid.", previous: $exception);
        }
    }

    /** @param array<string, mixed> $value */
    public static function object(array $value): object
    {
        return (object) $value;
    }

    /** @param list<array<string, mixed>> $values @return list<object> */
    public static function objectList(array $values): array
    {
        return array_map(static fn (array $value): object => (object) $value, $values);
    }
}
