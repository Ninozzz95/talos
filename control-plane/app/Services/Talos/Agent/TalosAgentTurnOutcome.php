<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use Kadmos\Provider\ProviderFailure;

final readonly class TalosAgentTurnOutcome
{
    public function __construct(
        public string $status,
        public string $turnId,
        public string $runId,
        public ?string $text = null,
        public ?string $failureCode = null,
        public ?ProviderFailure $providerFailure = null,
    ) {}
}
