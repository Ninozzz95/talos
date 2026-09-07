<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use RuntimeException;

final class TalosProviderStreamCancelledException extends RuntimeException
{
    public function __construct(public readonly string $reason)
    {
        parent::__construct('Provider stream was cancelled.');
    }
}
