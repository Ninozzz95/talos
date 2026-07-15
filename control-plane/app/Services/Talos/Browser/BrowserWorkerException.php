<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use RuntimeException;

final class BrowserWorkerException extends RuntimeException
{
    /** @param array<string, string> $details */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
    )
    {
        parent::__construct($message);
    }
}
