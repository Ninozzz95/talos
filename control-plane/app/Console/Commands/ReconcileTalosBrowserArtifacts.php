<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Talos\Browser\TalosBrowserArtifactReconciler;
use Illuminate\Console\Command;

final class ReconcileTalosBrowserArtifacts extends Command
{
    protected $signature = 'talos:browser-artifacts:reconcile';

    protected $description = 'Reconcile durable TALOS browser artifact cleanup journals';

    public function handle(TalosBrowserArtifactReconciler $reconciler): int
    {
        try {
            $result = $reconciler->reconcileAll();
            $this->line(json_encode($result, JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            report($exception);
            $this->error('Browser artifact reconciliation failed.');

            return self::FAILURE;
        }
    }
}
