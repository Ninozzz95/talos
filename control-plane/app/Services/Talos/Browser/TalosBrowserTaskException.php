<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;
use RuntimeException;

final class TalosBrowserTaskException extends RuntimeException
{
    /** @param array<string, mixed> $details */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly ?string $remediation = null,
        public readonly array $details = [],
    ) {
        if (preg_match('/^TALOS_BROWSER_[A-Z0-9_]{1,96}$/D', $errorCode) !== 1) {
            throw new InvalidArgumentException('Browser task error code is invalid.');
        }
        if ($remediation !== null && (trim($remediation) === '' || mb_strlen($remediation) > 512)) {
            throw new InvalidArgumentException('Browser task remediation is invalid.');
        }
        try {
            json_encode($details, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new InvalidArgumentException('Browser task error details must be JSON-safe.', previous: $exception);
        }
        parent::__construct($message);
    }
}
