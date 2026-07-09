<?php

declare(strict_types=1);

namespace App\Services\Google;

use RuntimeException;
use Throwable;

final class GoogleDriveException extends RuntimeException
{
    public function __construct(
        private readonly string $codeName,
        string $message,
        private readonly int $httpStatus = 422,
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
}

