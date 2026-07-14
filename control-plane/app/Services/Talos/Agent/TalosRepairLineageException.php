<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;

final class TalosRepairLineageException extends InvalidArgumentException
{
    public function __construct(
        public readonly string $faultCode = 'TALOS_TOOL_REPAIR_LINEAGE_AMBIGUOUS',
        string $message = 'Repaired provider calls do not have an unambiguous logical lineage.',
    ) {
        parent::__construct($message);
    }
}
