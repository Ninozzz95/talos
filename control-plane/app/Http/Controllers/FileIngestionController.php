<?php

declare(strict_types=1);

namespace App\Http\Controllers;

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

        $result = $this->ingestion->ingest($validated['file']);

        return response()->json(['data' => $result], 201);
    }
}
