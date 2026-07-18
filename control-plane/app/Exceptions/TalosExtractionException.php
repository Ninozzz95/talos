<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;
use Throwable;

final class TalosExtractionException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $safeMessage,
        ?Throwable $previous = null,
    ) {
        parent::__construct($safeMessage, 0, $previous);
    }
}
