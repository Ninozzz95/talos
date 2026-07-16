<?php

declare(strict_types=1);

namespace Kadmos\Browser\Policy;

use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserActionRisk;

final readonly class BrowserActionPolicyDecision
{
    public function __construct(
        public BrowserActionDisposition $disposition,
        public BrowserActionRisk $risk,
        public string $reasonCode,
        public string $remediation,
    ) {
        if ($reasonCode === '' || strlen($reasonCode) > 128) {
            throw new InvalidArgumentException('Browser policy reason code is invalid.');
        }
        if ($remediation === '' || strlen($remediation) > 512) {
            throw new InvalidArgumentException('Browser policy remediation is invalid.');
        }
    }

    public function allowsModelDispatch(): bool
    {
        return $this->disposition === BrowserActionDisposition::Allow;
    }
}
