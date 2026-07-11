<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use RuntimeException;

final class TalosBrowserCommandException extends RuntimeException
{
    /** @param array<string, mixed> $details */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly int $status = 422,
        public readonly string $origin = 'control_plane',
    ) {
        parent::__construct($message);
    }
}
