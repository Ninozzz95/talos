<?php

declare(strict_types=1);

namespace App\Services\Security;

use InvalidArgumentException;
use Throwable;
use Uri\WhatWg\Url;

final readonly class CanonicalHttpUrl
{
    private function __construct(
        public string $original,
        public string $asciiUrl,
        public string $unicodeUrl,
        public string $scheme,
        public string $asciiHost,
        public string $unicodeHost,
        public ?int $port,
        public string $path,
        public ?string $query,
        public ?string $fragment,
    ) {}

    public static function fromString(string $url): self
    {
        if ($url === '' || trim($url) !== $url) {
            throw new InvalidArgumentException('URL is empty or contains surrounding whitespace.');
        }

        try {
            $softErrors = [];
            $parsed = new Url($url, softErrors: $softErrors);
        } catch (Throwable $exception) {
            throw new InvalidArgumentException('URL is malformed.', previous: $exception);
        }

        if ($softErrors !== []) {
            throw new InvalidArgumentException('URL contains unsupported recoverable syntax errors.');
        }

        $scheme = strtolower($parsed->getScheme());
        $rawAsciiHost = $parsed->getAsciiHost();
        if (! in_array($scheme, ['http', 'https'], true)
            || ! is_string($rawAsciiHost)
            || $rawAsciiHost === '') {
            throw new InvalidArgumentException('URL scheme or host is unsupported.');
        }
        if (($parsed->getUsername() !== null && $parsed->getUsername() !== '')
            || ($parsed->getPassword() !== null && $parsed->getPassword() !== '')) {
            throw new InvalidArgumentException('URL credentials are not allowed.');
        }

        if (str_ends_with($rawAsciiHost, '.')) {
            $parsed = $parsed->withHost(rtrim($rawAsciiHost, '.'));
        }

        $asciiHost = self::hostWithoutIpv6Brackets((string) $parsed->getAsciiHost());
        $unicodeHost = self::hostWithoutIpv6Brackets((string) $parsed->getUnicodeHost());
        if ($asciiHost === '') {
            throw new InvalidArgumentException('URL host is empty.');
        }

        return new self(
            original: $url,
            asciiUrl: $parsed->toAsciiString(),
            unicodeUrl: $parsed->toUnicodeString(),
            scheme: $scheme,
            asciiHost: strtolower($asciiHost),
            unicodeHost: mb_strtolower($unicodeHost),
            port: $parsed->getPort(),
            path: $parsed->getPath(),
            query: $parsed->getQuery(),
            fragment: $parsed->getFragment(),
        );
    }

    public function toAsciiString(): string
    {
        return $this->asciiUrl;
    }

    private static function hostWithoutIpv6Brackets(string $host): string
    {
        return str_starts_with($host, '[') && str_ends_with($host, ']')
            ? substr($host, 1, -1)
            : $host;
    }
}
