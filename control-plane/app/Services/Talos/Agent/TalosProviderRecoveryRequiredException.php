<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use RuntimeException;

final class TalosProviderRecoveryRequiredException extends RuntimeException
{
    public function __construct(
        public readonly string $faultCode = 'TALOS_PROVIDER_RECOVERY_REQUIRED',
        string $message = 'A provider operation has an uncertain outcome and requires explicit recovery.',
    ) {
        parent::__construct($message);
    }
}
