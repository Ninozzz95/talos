<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use App\Services\TalosSessionExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosSessionExportController extends Controller
{
    public function __invoke(Request $request, TalosSession $session, TalosSessionExportService $exports): JsonResponse
    {
        $validated = $request->validate([
            'format' => ['sometimes', 'string', Rule::in(['json', 'markdown', 'context_manifest', 'benchmark_scenario'])],
        ]);

        $format = $validated['format'] ?? 'json';

        if ($format === 'markdown') {
            $payload = $exports->markdownExport($session);
        } elseif ($format === 'context_manifest') {
            $payload = $exports->contextManifestExport($session);
        } elseif ($format === 'benchmark_scenario') {
            $readiness = $exports->benchmarkReadinessForSession($session);
            if (! $readiness['ready']) {
                return response()->json([
                    'error' => 'SESSION_EXPORT_NOT_BENCHMARK_READY',
                    'message' => 'Session export requires a succeeded run with prompt, prompt_hash, and context_hash before creating a benchmark scenario.',
                    'missing' => $readiness['missing'],
                ], 422);
            }

            $payload = [
                'schema_version' => 1,
                'report_type' => 'talos_benchmark_scenario_export',
                'export_status' => 'complete',
                'session_id' => $session->id,
                'exported_at' => now()->toJSON(),
                'scenario' => $readiness['scenario'],
            ];
        } else {
            $payload = $exports->jsonEvidencePack($session);
        }

        $exports->recordAudit($session, $format);

        return response()
            ->json($payload)
            ->header('Content-Disposition', sprintf('attachment; filename="talos-session-%s-%s.json"', $session->id, $format));
    }
}
