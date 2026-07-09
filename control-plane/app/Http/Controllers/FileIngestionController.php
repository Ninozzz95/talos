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
    public function __construct(private readonly FileIngestionService $ingestion)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => [
                'required',
                File::types(['txt', 'md', 'json', 'csv'])->max(10 * 1024),
            ],
        ]);

        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $result = $this->ingestion->ingest($validated['file'], $userId);

        TalosAuditEvent::record('file.uploaded', 'file', (string) ($result['id'] ?? ''), [
            'original_name' => $result['original_name'] ?? null,
            'status' => $result['status'] ?? null,
            'mime_type' => $result['mime_type'] ?? null,
            'size_bytes' => $result['size_bytes'] ?? null,
            'checksum' => $result['checksum'] ?? $result['sha256'] ?? null,
        ]);

        if (($result['status'] ?? null) === 'failed') {
            return response()->json([
                'message' => $result['failure_reason'] ?? 'File could not be parsed for Context Vault ingestion.',
                'data' => $result,
            ], 422);
        }

        return response()->json(['data' => $result], 201);
    }
}
