<?php

declare(strict_types=1);

namespace App\Services\Talos\FileAuthority;

use RuntimeException;

final class TalosFileAuthorityException extends RuntimeException
{
    /** @param array<string, mixed> $details */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly string $field = 'file_ids',
        public readonly int $status = 422,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}
