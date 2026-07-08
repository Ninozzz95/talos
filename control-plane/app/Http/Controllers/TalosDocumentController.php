<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosDocument;
use App\Models\TalosRunArtifact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosDocumentController extends Controller
{
    public function index(): JsonResponse
    {
        $documents = TalosDocument::query()
            ->with(['run', 'runArtifact'])
            ->latest('created_at')
            ->get()
            ->map(fn (TalosDocument $document): array => $document->toApiArray(includeProvenance: true))
            ->values();

        return response()->json(['data' => $documents]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'run_id' => ['sometimes', 'nullable', 'string', 'exists:talos_runs,id'],
            'run_artifact_id' => ['sometimes', 'nullable', 'string', 'exists:talos_run_artifacts,id'],
            'research_report_id' => ['sometimes', 'nullable', 'string', 'exists:talos_research_reports,id'],
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'document_type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'format' => ['sometimes', 'nullable', 'string', 'max:64'],
            'status' => ['sometimes', 'nullable', 'string', 'max:64'],
            'content' => ['required', 'string', 'min:1', 'max:500000'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $artifact = isset($validated['run_artifact_id'])
            ? TalosRunArtifact::query()->find($validated['run_artifact_id'])
            : null;

        if ($artifact instanceof TalosRunArtifact && empty($validated['run_id'])) {
            $validated['run_id'] = $artifact->run_id;
        }

        $document = TalosDocument::query()->create([
            ...$validated,
            'document_type' => $validated['document_type'] ?? 'document',
            'format' => $validated['format'] ?? 'markdown',
            'status' => $validated['status'] ?? 'active',
            'content_hash' => hash('sha256', (string) $validated['content']),
        ]);
        assert($document instanceof TalosDocument);

        return response()->json(['data' => $document->load(['run', 'runArtifact'])->toApiArray(includeProvenance: true)], 201);
    }

    public function show(TalosDocument $document): JsonResponse
    {
        $document->load(['run', 'runArtifact']);

        return response()->json(['data' => $document->toApiArray(includeContent: true, includeProvenance: true)]);
    }

    public function export(TalosDocument $document): JsonResponse
    {
        $document->load(['run', 'runArtifact']);

        return response()->json(['data' => $document->toApiArray(includeContent: true, includeProvenance: true)]);
    }
}
