<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

final readonly class TalosAgentTurnOutcome
{
    public function __construct(
        public string $status,
        public string $turnId,
        public string $runId,
        public ?string $text = null,
        public ?string $failureCode = null,
    ) {}
}
