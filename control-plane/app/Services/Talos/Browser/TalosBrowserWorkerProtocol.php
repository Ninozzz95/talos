<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserWorkerProtocol
{
    public const WORKER = 'talos.browser.worker.v2';

    public const HANDSHAKE_SCHEMA = 'talos.browser.worker-handshake.v2';

    public const HANDSHAKE_PATH = '/protocols/'.self::WORKER.'/handshake';

    public const HMI_RUNTIME = 'talos_browser_hmi_runtime_v2.1.0';

    public const SESSION_BOOTSTRAP_PATH = '/protocols/'.self::HMI_RUNTIME.'/sessions';

    public const IDEMPOTENT_SESSION_BOOTSTRAP_PATH = self::SESSION_BOOTSTRAP_PATH.'/idempotent';

    public const SESSION_CANCEL_SUFFIX = '/cancel';

    public const ADAPTER_NAME = 'playwright-mcp';

    public const ADAPTER_VERSION = '0.0.78';

    public const REQUIRED_CAPABILITIES = [
        'navigate',
        'snapshot',
        'screenshot',
        'read',
        'click',
        'interactive_frame',
        'semantic_locator',
        'tabs',
    ];
}
