<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use RuntimeException;

final class TalosBrowserLegacyWritesDisabled extends RuntimeException
{
    public function __construct(public readonly string $operation)
    {
        parent::__construct('Legacy Browser writes are disabled while TALOS uses the canonical Browser v1 contract.');
    }
}
