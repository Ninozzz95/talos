<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBoundedBase64Decoder
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    public static function decode(mixed $payload, int $maxDecodedBytes): string|false
    {
        if (! is_string($payload) || $payload === '' || $maxDecodedBytes < 1) {
            return false;
        }

        $encodedLength = strlen($payload);
        if ($encodedLength < 4 || $encodedLength % 4 !== 0) {
            return false;
        }

        $maxEncodedLength = intdiv($maxDecodedBytes + 2, 3) * 4;
        if ($encodedLength > $maxEncodedLength) {
            return false;
        }

        $padding = 0;
        if ($payload[$encodedLength - 1] === '=') {
            $padding = 1;
            if ($payload[$encodedLength - 2] === '=') {
                $padding = 2;
            }
        }

        $alphabetLength = $encodedLength - $padding;
        if ($alphabetLength < 2
            || strspn($payload, self::ALPHABET, 0, $alphabetLength) !== $alphabetLength
            || ($padding === 0 && str_contains($payload, '='))) {
            return false;
        }

        for ($index = $alphabetLength; $index < $encodedLength; $index++) {
            if ($payload[$index] !== '=') {
                return false;
            }
        }

        $decodedLength = intdiv($encodedLength, 4) * 3 - $padding;
        if ($decodedLength < 1 || $decodedLength > $maxDecodedBytes) {
            return false;
        }

        $decoded = base64_decode($payload, true);

        return is_string($decoded) && strlen($decoded) === $decodedLength
            ? $decoded
            : false;
    }
}
