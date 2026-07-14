<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserEvidenceEnvironment
{
    public function rawEvidenceEnabled(): bool
    {
        return app()->environment(['local', 'testing'])
            && filter_var(config('services.talos.browser.dev_evidence', false), FILTER_VALIDATE_BOOL);
    }
}
