<?php

declare(strict_types=1);

namespace App\Services\Policy;

use RuntimeException;

final class TalosCapabilityPolicyException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $details
     * @param  array<string, mixed>|null  $snapshot
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly ?string $field = null,
        public readonly array $details = [],
        public readonly ?array $snapshot = null,
    ) {
        parent::__construct($message);
    }
}
