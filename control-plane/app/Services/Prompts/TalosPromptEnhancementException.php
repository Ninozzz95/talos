<?php

declare(strict_types=1);

namespace App\Services\Prompts;

use RuntimeException;
use Throwable;

final class TalosPromptEnhancementException extends RuntimeException
{
    public function __construct(
        private readonly string $codeName,
        string $message,
        private readonly int $httpStatus,
        private readonly bool $retryable,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function codeName(): string
    {
        return $this->codeName;
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }

    public function retryable(): bool
    {
        return $this->retryable;
    }
}
