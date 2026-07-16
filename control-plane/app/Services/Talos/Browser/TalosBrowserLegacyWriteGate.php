<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Illuminate\Support\Facades\Config;

final class TalosBrowserLegacyWriteGate
{
    public function enabled(): bool
    {
        return Config::boolean('services.talos.browser.legacy_writes_enabled', true);
    }

    public function assertEnabled(string $operation): void
    {
        if (! $this->enabled()) {
            throw new TalosBrowserLegacyWritesDisabled($operation);
        }
    }
}
