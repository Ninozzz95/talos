<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;

interface StreamingProviderTransport
{
    /**
     * @param array<string, mixed> $payload
     * @param list<string> $headers
     * @return iterable<string>
     */
    public function stream(
        string $endpoint,
        array $payload,
        array $headers,
        int $timeoutMs,
        Closure $isCancelled,
    ): iterable;
}
