<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Services\Talos\Browser\TalosBrowserLegacyWriteGate;
use Illuminate\Database\Eloquent\Model;

trait GuardsLegacyBrowserWrites
{
    protected static function bootGuardsLegacyBrowserWrites(): void
    {
        static::saving(static function (Model $model): void {
            app(TalosBrowserLegacyWriteGate::class)->assertEnabled(
                'eloquent.save:'.$model->getTable(),
            );
        });
    }
}
