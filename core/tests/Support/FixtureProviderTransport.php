<?php

declare(strict_types=1);

namespace Kadmos\Tests\Support;

use Kadmos\Provider\ProviderTransport;

final class FixtureProviderTransport implements ProviderTransport
{
    private \Closure $callback;

    public function __construct(callable $callback)
    {
        $this->callback = \Closure::fromCallable($callback);
    }

    public function send(string $endpoint, array $payload, array $headers, int $timeoutMs): array
    {
        return ($this->callback)($endpoint, $payload, $headers, $timeoutMs);
    }
}
