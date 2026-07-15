<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserWorkerProtocol
{
    public const HMI_RUNTIME = 'talos_browser_hmi_runtime_v2.1.0';

    public const SESSION_BOOTSTRAP_PATH = '/protocols/'.self::HMI_RUNTIME.'/sessions';
}
