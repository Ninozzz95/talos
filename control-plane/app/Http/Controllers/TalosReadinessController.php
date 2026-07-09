<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Admin\TalosReadinessService;
use Illuminate\Http\JsonResponse;

final class TalosReadinessController extends Controller
{
    public function __invoke(TalosReadinessService $readiness): JsonResponse
    {
        $report = $readiness->report();

        return new JsonResponse($report, $report['ready'] ? 200 : 503);
    }
}

