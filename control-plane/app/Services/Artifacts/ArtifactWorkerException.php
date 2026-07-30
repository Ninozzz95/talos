<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use RuntimeException;
use Throwable;

final class ArtifactWorkerException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 502,
        public readonly array $details = [],
        public readonly bool $ambiguous = false,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public static function protocol(string $message = 'Artifact worker returned an incompatible response.'): self
    {
        return new self('TALOS_ARTIFACT_WORKER_PROTOCOL_INVALID', $message, 502);
    }
}
