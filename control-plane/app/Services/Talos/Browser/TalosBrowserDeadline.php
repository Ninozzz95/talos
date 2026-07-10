<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserDeadline
{
    private readonly int $startedAt;

    public function __construct(private readonly int $budgetMilliseconds = 60000)
    {
        $this->startedAt = hrtime(true);
    }

    public function expired(): bool
    {
        return $this->remainingMilliseconds() <= 0;
    }

    public function remainingMilliseconds(): int
    {
        return max(0, $this->budgetMilliseconds - (int) floor((hrtime(true) - $this->startedAt) / 1_000_000));
    }

    public function remainingSeconds(): float
    {
        return max(0.001, $this->remainingMilliseconds() / 1000);
    }
}
