<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserTask;
use Kadmos\Browser\Contract\BrowserTask;
use Kadmos\Browser\Contract\BrowserTaskStatus;

final class TalosBrowserTaskReducer
{
    public function transition(
        TalosBrowserTask $task,
        BrowserTaskStatus $next,
        int $expectedVersion,
    ): BrowserTask {
        return $task->toCoreContract()->transition($next, $expectedVersion);
    }
}
