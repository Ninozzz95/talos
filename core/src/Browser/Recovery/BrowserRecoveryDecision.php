<?php

declare(strict_types=1);

namespace Kadmos\Browser\Recovery;

use InvalidArgumentException;

final readonly class BrowserRecoveryDecision
{
    public function __construct(
        public BrowserRecoveryStrategy $strategy,
        public string $reasonCode,
        public string $remediation,
    ) {
        if ($reasonCode === '' || strlen($reasonCode) > 128) {
            throw new InvalidArgumentException('Browser recovery reason code is invalid.');
        }
        if ($remediation === '' || strlen($remediation) > 512) {
            throw new InvalidArgumentException('Browser recovery remediation is invalid.');
        }
    }
}
