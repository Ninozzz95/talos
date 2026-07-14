<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use RuntimeException;

final class TalosBudgetExceededException extends RuntimeException
{
    public function __construct(public readonly string $faultCode, string $message)
    {
        parent::__construct($message);
    }
}
