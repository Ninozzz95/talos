<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use Kadmos\Tool\ToolContractGuard;

final readonly class ProviderFailure
{
    /** @param array<string, mixed> $details */
    public function __construct(
        public string $code,
        public string $message,
        public bool $retryable,
        public ?int $httpStatus = null,
        public array $details = [],
    ) {
        ToolContractGuard::nonEmptyString($code, 'Provider failure code', 128);
        ToolContractGuard::nonEmptyString($message, 'Provider failure message', 4096);
        if ($httpStatus !== null && ($httpStatus < 100 || $httpStatus > 599)) {
            throw new InvalidArgumentException('Provider failure HTTP status is invalid.');
        }
        ToolContractGuard::objectArray($details, 'Provider failure details');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return ToolContractGuard::redact([
            'code' => $this->code,
            'message' => $this->message,
            'retryable' => $this->retryable,
            'http_status' => $this->httpStatus,
            'details' => $this->details,
        ]);
    }
}
