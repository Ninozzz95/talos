<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosFile;
use Illuminate\Http\JsonResponse;

final class TalosFileController extends Controller
{
    public function index(): JsonResponse
    {
        $files = TalosFile::query()
            ->withCount('chunks')
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosFile $file): array => $file->toApiArray())
            ->values();

        return response()->json(['data' => $files]);
    }

    public function show(TalosFile $file): JsonResponse
    {
        $file->load('chunks');

        return response()->json(['data' => $file->toApiArray(includeChunks: true)]);
    }
}
