<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchReport;
use App\Models\TalosRunArtifact;
use Illuminate\Http\JsonResponse;

final class TalosArtifactController extends Controller
{
    public function index(): JsonResponse
    {
        $artifacts = TalosRunArtifact::query()
            ->with('run')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosRunArtifact $artifact): array => $artifact->toApiArray(includeRun: true))
            ->values();

        return response()->json(['data' => $artifacts]);
    }

    public function show(TalosRunArtifact $artifact): JsonResponse
    {
        $artifact->load('run');

        return response()->json(['data' => $artifact->toApiArray(includeRun: true)]);
    }

    public function preview(TalosRunArtifact $artifact): JsonResponse
    {
        $artifact->load('run');

        if ($artifact->artifact_type === 'research_report') {
            $reportId = $this->researchReportIdFromArtifact($artifact);
            $report = $reportId ? TalosResearchReport::query()
                ->with(['sources', 'claims.sources'])
                ->find($reportId) : null;

            if ($report instanceof TalosResearchReport) {
                return response()->json([
                    'data' => [
                        'preview_available' => true,
                        'preview_type' => 'research_report',
                        'artifact' => $artifact->toApiArray(includeRun: true),
                        'report' => $report->toApiArray(includeDetails: true),
                    ],
                ]);
            }
        }

        return response()->json([
            'data' => [
                'preview_available' => false,
                'fallback' => 'download',
                'artifact' => $artifact->toApiArray(includeRun: true),
            ],
        ]);
    }

    private function researchReportIdFromArtifact(TalosRunArtifact $artifact): ?string
    {
        $metadata = $artifact->metadata ?? [];
        $metadataReportId = $metadata['research_report_id'] ?? null;

        if (is_string($metadataReportId) && trim($metadataReportId) !== '') {
            return trim($metadataReportId);
        }

        $prefix = 'talos://research-reports/';
        if (str_starts_with($artifact->uri, $prefix)) {
            return substr($artifact->uri, strlen($prefix));
        }

        return null;
    }
}
