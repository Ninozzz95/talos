<?php

declare(strict_types=1);

namespace Kadmos\Provider;

interface ProviderTransport
{
    /**
     * @param array<string, mixed> $payload
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    public function send(string $endpoint, array $payload, array $headers, int $timeoutMs): array;
}
