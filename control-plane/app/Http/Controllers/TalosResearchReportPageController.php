<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchReport;
use App\Services\Research\TalosResearchReportRenderer;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Auth;

final class TalosResearchReportPageController extends Controller
{
    public function __invoke(TalosResearchReport $researchReport, TalosResearchReportRenderer $renderer): View
    {
        abort_unless(Auth::id() === $researchReport->user_id, 404);

        $researchReport->load(['sources', 'claims.sources', 'run.artifacts']);

        return view('talos.research-report', [
            'report' => $researchReport,
            'payload' => $renderer->payload($researchReport),
            'reportHtml' => $renderer->html($researchReport),
        ]);
    }
}
