<?php

declare(strict_types=1);

namespace AVM;

interface HttpClientInterface
{
    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     * @throws \RuntimeException
     */
    public function postJson(string $url, array $body): array;
}
