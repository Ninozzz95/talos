<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

final readonly class TalosUploadDecision
{
    /** @param array<string, mixed> $evidence */
    public function __construct(
        public string $detectedMime,
        public string $canonicalExtension,
        public array $evidence,
    ) {}
}
