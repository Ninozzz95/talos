<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosFileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $files = TalosFile::query()
            ->where('user_id', $userId)
            ->withCount('chunks')
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosFile $file): array => $file->toApiArray())
            ->values();

        return response()->json(['data' => $files]);
    }

    public function show(Request $request, TalosFile $file): JsonResponse
    {
        abort_unless($request->user()?->id === $file->user_id, 404);

        $file->load('chunks');

        return response()->json(['data' => $file->toApiArray(includeChunks: true)]);
    }
}
