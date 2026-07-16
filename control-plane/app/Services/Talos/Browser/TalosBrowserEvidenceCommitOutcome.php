<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserEvidenceBundle;

final readonly class TalosBrowserEvidenceCommitOutcome
{
    public function __construct(
        public TalosBrowserEvidenceBundle $bundle,
        public string $state,
        public bool $replayed,
    ) {}
}
