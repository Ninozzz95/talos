<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use Kadmos\Workers\NodeWorkerControlException;
use RuntimeException;

final class TalosToolRecoveryRequiredException extends RuntimeException implements NodeWorkerControlException
{
    public function __construct(
        public readonly string $faultCode = 'TALOS_TOOL_RECOVERY_REQUIRED',
        string $message = 'A tool effect has an uncertain outcome and requires explicit recovery.',
    ) {
        parent::__construct($message);
    }
}
