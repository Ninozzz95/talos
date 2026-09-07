<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Services\Security\CanonicalHttpUrl;
use InvalidArgumentException;
use RuntimeException;

final readonly class TalosBrowserTestFixturePermit
{
    private function __construct(
        public bool $enabled,
        private ?int $port,
    ) {}

    public static function disabled(): self
    {
        return new self(false, null);
    }

    public static function fromEnvironment(?string $origin, bool $testing): self
    {
        if (! $testing || $origin === null) {
            return self::disabled();
        }

        if (preg_match('/\Ahttp:\/\/127\.0\.0\.1:([0-9]{1,5})\z/D', $origin, $matches) !== 1) {
            throw new RuntimeException('TALOS_BROWSER_TEST_FIXTURE_ORIGIN must be an exact loopback HTTP origin.');
        }

        $port = (int) $matches[1];
        if ($port < 1024 || $port > 65535) {
            throw new RuntimeException('TALOS_BROWSER_TEST_FIXTURE_ORIGIN must use a non-privileged TCP port.');
        }

        try {
            $canonical = CanonicalHttpUrl::fromString($origin);
        } catch (InvalidArgumentException $exception) {
            throw new RuntimeException('TALOS_BROWSER_TEST_FIXTURE_ORIGIN is malformed.', previous: $exception);
        }

        if ($canonical->scheme !== 'http'
            || $canonical->asciiHost !== '127.0.0.1'
            || $canonical->port !== $port
            || ! in_array($canonical->path, ['', '/'], true)
            || $canonical->query !== null
            || $canonical->fragment !== null) {
            throw new RuntimeException('TALOS_BROWSER_TEST_FIXTURE_ORIGIN is not an exact origin.');
        }

        return new self(true, $port);
    }

    public function allows(string $url): bool
    {
        if (! $this->enabled || $this->port === null) {
            return false;
        }

        if (preg_match('/\Ahttp:\/\/127\.0\.0\.1:([0-9]{1,5})(?=\/|\?|#|\z)/D', $url, $matches) !== 1
            || (int) $matches[1] !== $this->port) {
            return false;
        }

        try {
            $canonical = CanonicalHttpUrl::fromString($url);
        } catch (InvalidArgumentException) {
            return false;
        }

        return $canonical->scheme === 'http'
            && $canonical->asciiHost === '127.0.0.1'
            && $canonical->port === $this->port;
    }
}
