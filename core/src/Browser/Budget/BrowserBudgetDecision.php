<?php

declare(strict_types=1);

namespace Kadmos\Browser\Budget;

use InvalidArgumentException;

final readonly class BrowserBudgetDecision
{
    /**
     * @param array{actions: int, elapsed_ms: int, bytes: int, tabs: int, domains: int, tokens: int} $projectedUsage
     * @param list<string> $exhaustedLimits
     */
    public function __construct(
        public bool $allowed,
        public array $projectedUsage,
        public array $exhaustedLimits,
    ) {
        if ($allowed !== ($exhaustedLimits === [])) {
            throw new InvalidArgumentException('Browser budget decision state is inconsistent.');
        }
    }
}
