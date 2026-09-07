<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchReport;
use App\Models\TalosRunArtifact;
use App\Models\User;
use App\Support\TalosStoragePathBoundary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\HeaderUtils;

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

    public function download(Request $request, TalosRunArtifact $artifact): BinaryFileResponse|JsonResponse
    {
        $artifact->load('run');
        $this->assertArtifactOwnedByCurrentUser($request, $artifact);
        $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
        if ($artifact->artifact_type !== 'generated_document'
            || ($metadata['promotion_status'] ?? null) !== 'verified'
            || ($metadata['storage_disk'] ?? null) !== 'local'
            || ! is_string($metadata['storage_path'] ?? null)
            || ! is_string($metadata['sha256'] ?? null)
            || ! is_int($metadata['size_bytes'] ?? null)) {
            abort(404);
        }

        $disk = Storage::disk('local');
        $absolutePath = $disk->path($metadata['storage_path']);
        $realPath = realpath($absolutePath);
        $realRoot = realpath($disk->path(''));
        if (! is_string($realPath)
            || ! is_string($realRoot)
            || ! is_file($realPath)
            || ! TalosStoragePathBoundary::contains($realRoot, $realPath)) {
            return $this->contentIntegrityFault();
        }

        clearstatcache(true, $realPath);
        $size = filesize($realPath);
        $sha256 = hash_file('sha256', $realPath);
        if (! is_int($size)
            || $size !== $metadata['size_bytes']
            || ! is_string($sha256)
            || ! hash_equals($metadata['sha256'], $sha256)) {
            return $this->contentIntegrityFault();
        }

        $mime = is_string($artifact->mime_type) && trim($artifact->mime_type) !== ''
            ? trim($artifact->mime_type)
            : 'application/octet-stream';
        $filename = $this->safeFilename($metadata['filename'] ?? null, (string) $artifact->id);
        $fallback = preg_replace('/[^A-Za-z0-9._ -]/', '_', Str::ascii($filename));
        $fallback = is_string($fallback) && trim($fallback) !== ''
            ? trim(str_replace('%', '_', $fallback))
            : 'talos-artifact-'.$artifact->id;

        $response = response()->file($realPath, [
            'Content-Type' => $mime,
            'Content-Disposition' => HeaderUtils::makeDisposition(
                HeaderUtils::DISPOSITION_ATTACHMENT,
                $filename,
                $fallback,
            ),
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $response->headers->set('Cache-Control', 'private, no-cache, must-revalidate');
        $response->setEtag('sha256-'.$sha256);
        $response->isNotModified($request);

        return $response;
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

    private function contentIntegrityFault(): JsonResponse
    {
        return response()->json([
            'code' => 'TALOS_ARTIFACT_CONTENT_INTEGRITY',
            'message' => 'Artifact bytes are unavailable or no longer match their verified record.',
            'details' => [],
        ], 409);
    }

    private function safeFilename(mixed $value, string $artifactId): string
    {
        $filename = is_string($value)
            ? trim(basename(str_replace('\\', '/', $value)))
            : '';

        return $filename !== '' && ! in_array($filename, ['.', '..'], true)
            ? $filename
            : 'talos-artifact-'.$artifactId;
    }
}
