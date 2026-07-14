<?php

declare(strict_types=1);

namespace Kadmos\Security;

final readonly class PolicyDecision
{
    /**
     * @param array<string, mixed> $audit
     */
    public function __construct(
        public bool $allowed,
        public string $reason,
        public int $timeoutMs,
        public array $audit = [],
    ) {
    }
}
