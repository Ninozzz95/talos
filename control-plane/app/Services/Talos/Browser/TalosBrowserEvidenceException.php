<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;
use RuntimeException;
use Throwable;

final class TalosBrowserEvidenceException extends RuntimeException
{
    public function __construct(
        public readonly string $faultCode,
        string $message,
        public readonly string $remediation = 'Open Doctor and inspect the Browser evidence journal before retrying.',
        ?Throwable $previous = null,
    ) {
        if (preg_match('/^TALOS_BROWSER_EVIDENCE_[A-Z0-9_]{1,80}$/D', $faultCode) !== 1) {
            throw new InvalidArgumentException('Browser evidence fault code is invalid.');
        }
        if (trim($remediation) === '' || mb_strlen($remediation) > 512) {
            throw new InvalidArgumentException('Browser evidence remediation is invalid.');
        }

        parent::__construct($message, previous: $previous);
    }
}
