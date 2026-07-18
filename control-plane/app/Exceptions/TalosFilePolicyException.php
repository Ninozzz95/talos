<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class TalosFilePolicyException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $safeMessage,
    ) {
        parent::__construct($safeMessage);
    }
}
