<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use RuntimeException;

final class ProviderRequestException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $responseBody,
    ) {
        parent::__construct("Provider API error HTTP {$status}: {$responseBody}");
    }
}
