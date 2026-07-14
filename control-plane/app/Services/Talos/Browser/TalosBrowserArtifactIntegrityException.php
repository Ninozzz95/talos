<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use RuntimeException;

final class TalosBrowserArtifactIntegrityException extends RuntimeException
{
    public function __construct(
        public readonly string $artifactId,
        public readonly string $reason,
    ) {
        parent::__construct('Browser artifact integrity verification failed.');
    }
}
