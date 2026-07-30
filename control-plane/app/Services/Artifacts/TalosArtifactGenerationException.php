<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use RuntimeException;
use Throwable;

final class TalosArtifactGenerationException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus,
        public readonly ?string $field = null,
        public readonly array $details = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
