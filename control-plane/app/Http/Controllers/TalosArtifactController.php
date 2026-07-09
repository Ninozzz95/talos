<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchReport;
use App\Models\TalosRunArtifact;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosArtifactController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);

        $artifacts = TalosRunArtifact::query()
            ->with('run')
            ->whereHas('run', fn ($query) => $query->where('user_id', $userId))
            ->latest('created_at')
            ->get()
            ->map(fn (TalosRunArtifact $artifact): array => $artifact->toApiArray(includeRun: true))
            ->values();

        return response()->json(['data' => $artifacts]);
    }

    public function show(Request $request, TalosRunArtifact $artifact): JsonResponse
    {
        $artifact->load('run');
        $this->assertArtifactOwnedByCurrentUser($request, $artifact);

        return response()->json(['data' => $artifact->toApiArray(includeRun: true)]);
    }

    public function preview(Request $request, TalosRunArtifact $artifact): JsonResponse
    {
        $artifact->load('run');
        $userId = $this->assertArtifactOwnedByCurrentUser($request, $artifact);

        if ($artifact->artifact_type === 'research_report') {
            $reportId = $this->researchReportIdFromArtifact($artifact);
            $report = $reportId ? TalosResearchReport::query()
                ->where('user_id', $userId)
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

    private function currentUserId(Request $request): int
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return (int) $user->id;
    }

    private function assertArtifactOwnedByCurrentUser(Request $request, TalosRunArtifact $artifact): int
    {
        $userId = $this->currentUserId($request);
        abort_unless($artifact->run !== null && (int) $artifact->run->user_id === $userId, 404);

        return $userId;
    }
}
