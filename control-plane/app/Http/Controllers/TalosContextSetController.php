<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TalosContextSetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $contextSets = TalosContextSet::query()
            ->where('user_id', $userId)
            ->withCount('sources')
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosContextSet $contextSet): array => $contextSet->toApiArray())
            ->values();

        return response()->json(['data' => $contextSets]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'file_ids' => ['sometimes', 'array'],
            'file_ids.*' => ['required', 'string', 'distinct', 'exists:talos_files,id'],
            'chunk_ids' => ['sometimes', 'array'],
            'chunk_ids.*' => ['required', 'string', 'distinct', 'exists:talos_file_chunks,id'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $fileIds = array_values($validated['file_ids'] ?? []);
        $chunkIds = array_values($validated['chunk_ids'] ?? []);
        $this->assertSourcesAreAvailable($fileIds, $chunkIds, $userId);

        $chunksById = TalosFileChunk::query()
            ->whereIn('id', $chunkIds)
            ->get()
            ->keyBy('id');

        $contextSet = DB::transaction(function () use ($validated, $fileIds, $chunkIds, $chunksById, $userId): TalosContextSet {
            $contextSet = TalosContextSet::query()->create([
                'user_id' => $userId,
                'name' => $validated['name'],
                'status' => 'available',
                'metadata' => $validated['metadata'] ?? null,
            ]);

            $sequence = 1;
            foreach ($fileIds as $fileId) {
                TalosContextSource::query()->create([
                    'context_set_id' => $contextSet->id,
                    'file_id' => $fileId,
                    'source_type' => 'uploaded_file',
                    'sequence' => $sequence++,
                    'metadata' => ['created_by' => 'api'],
                ]);
            }

            foreach ($chunkIds as $chunkId) {
                /** @var TalosFileChunk $chunk */
                $chunk = $chunksById->get($chunkId);

                TalosContextSource::query()->create([
                    'context_set_id' => $contextSet->id,
                    'file_id' => $chunk->file_id,
                    'file_chunk_id' => $chunk->id,
                    'source_type' => 'file_chunk',
                    'sequence' => $sequence++,
                    'metadata' => ['created_by' => 'api'],
                ]);
            }

            return $contextSet;
        });

        $contextSet->load(['sources.file', 'sources.fileChunk']);

        return response()->json(['data' => $contextSet->toApiArray(includeSources: true)], 201);
    }

    public function show(Request $request, TalosContextSet $contextSet): JsonResponse
    {
        abort_unless($request->user()?->id === $contextSet->user_id, 404);

        $contextSet->load(['sources.file', 'sources.fileChunk']);

        return response()->json(['data' => $contextSet->toApiArray(includeSources: true)]);
    }

    /**
     * @param list<string> $fileIds
     * @param list<string> $chunkIds
     */
    private function assertSourcesAreAvailable(array $fileIds, array $chunkIds, int $userId): void
    {
        if ($fileIds !== []) {
            $availableFileCount = TalosFile::query()
                ->whereIn('id', $fileIds)
                ->where('user_id', $userId)
                ->where('status', 'available')
                ->count();

            if ($availableFileCount !== count($fileIds)) {
                throw ValidationException::withMessages([
                    'file_ids' => 'Context sets can only use files in available status.',
                ]);
            }
        }

        if ($chunkIds !== []) {
            $availableChunkCount = TalosFileChunk::query()
                ->whereIn('talos_file_chunks.id', $chunkIds)
                ->whereHas('file', fn ($query) => $query
                    ->where('user_id', $userId)
                    ->where('status', 'available'))
                ->count();

            if ($availableChunkCount !== count($chunkIds)) {
                throw ValidationException::withMessages([
                    'chunk_ids' => 'Context sets can only use chunks from available files.',
                ]);
            }
        }
    }
}
