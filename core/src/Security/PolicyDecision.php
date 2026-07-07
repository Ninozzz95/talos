<?php

declare(strict_types=1);

namespace Kadmos\Security;

final readonly class PolicyDecision
{
    public function __construct(
        public bool $allowed,
        public string $reason,
        public int $timeoutMs,
    ) {
    }
}
