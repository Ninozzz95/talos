<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Services\FileIngestion\FileIngestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\File;

final class FileIngestionController extends Controller
{
    public function __construct(private readonly FileIngestionService $ingestion) {}

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => [
                'required',
                File::default()->max((int) ceil(((int) config('talos-files.max_upload_bytes', 10 * 1024 * 1024)) / 1024)),
            ],
        ]);

        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $result = $this->ingestion->ingest($validated['file'], $userId);
        $ingestionStatus = (string) ($result['status'] ?? 'unknown');
        $auditEvent = match ($ingestionStatus) {
            'available' => 'file.uploaded',
            'rejected' => 'file.rejected',
            'quarantined' => 'file.quarantined',
            'scanning_failed' => 'file.scanning_failed',
            'extraction_failed' => 'file.extraction_failed',
            default => 'file.ingestion_failed',
        };

        TalosAuditEvent::record($auditEvent, 'file', (string) ($result['id'] ?? ''), [
            'original_name' => $result['original_name'] ?? null,
            'status' => $ingestionStatus,
            'mime_type' => $result['mime_type'] ?? null,
            'size_bytes' => $result['size_bytes'] ?? null,
            'checksum' => $result['checksum'] ?? $result['sha256'] ?? null,
            'error_code' => $result['error_code'] ?? null,
        ]);

        if (($result['status'] ?? null) !== 'available') {
            $status = in_array(($result['status'] ?? null), ['scanning_failed', 'extraction_failed'], true) ? 503 : 422;

            return response()->json([
                'message' => $result['failure_reason'] ?? 'File could not be parsed for Context Vault ingestion.',
                'error_code' => $result['error_code'] ?? 'TALOS_FILE_INGESTION_FAILED',
                'data' => $result,
            ], $status);
        }

        return response()->json(['data' => $result], 201);
    }
}
