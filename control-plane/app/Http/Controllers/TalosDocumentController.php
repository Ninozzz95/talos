<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosDocument;
use App\Models\TalosResearchReport;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TalosDocumentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);

        $documents = TalosDocument::query()
            ->where('user_id', $userId)
            ->with(['run', 'runArtifact'])
            ->latest('created_at')
            ->get()
            ->map(fn (TalosDocument $document): array => $document->toApiArray(includeProvenance: true))
            ->values();

        return response()->json(['data' => $documents]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);
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

        $this->assertProvenanceOwnedByCurrentUser($validated, $userId);

        $artifact = filled($validated['run_artifact_id'] ?? null)
            ? TalosRunArtifact::query()->find((string) $validated['run_artifact_id'])
            : null;

        if ($artifact instanceof TalosRunArtifact && empty($validated['run_id'])) {
            $validated['run_id'] = $artifact->run_id;
        }

        $document = TalosDocument::query()->create([
            ...$validated,
            'user_id' => $userId,
            'document_type' => $validated['document_type'] ?? 'document',
            'format' => $validated['format'] ?? 'markdown',
            'status' => $validated['status'] ?? 'active',
            'content_hash' => hash('sha256', (string) $validated['content']),
        ]);
        assert($document instanceof TalosDocument);

        return response()->json(['data' => $document->load(['run', 'runArtifact'])->toApiArray(includeProvenance: true)], 201);
    }

    public function show(Request $request, TalosDocument $document): JsonResponse
    {
        $this->assertDocumentOwnedByCurrentUser($request, $document);
        $document->load(['run', 'runArtifact']);

        return response()->json(['data' => $document->toApiArray(includeContent: true, includeProvenance: true)]);
    }

    public function export(Request $request, TalosDocument $document): JsonResponse
    {
        $this->assertDocumentOwnedByCurrentUser($request, $document);
        $document->load(['run', 'runArtifact']);

        return response()->json(['data' => $document->toApiArray(includeContent: true, includeProvenance: true)]);
    }

    private function currentUserId(Request $request): int
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return (int) $user->id;
    }

    private function assertDocumentOwnedByCurrentUser(Request $request, TalosDocument $document): void
    {
        abort_unless((int) $document->user_id === $this->currentUserId($request), 404);
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function assertProvenanceOwnedByCurrentUser(array $validated, int $userId): void
    {
        $errors = [];
        $artifact = null;

        if (filled($validated['run_id'] ?? null) && ! TalosRun::query()
            ->where('user_id', $userId)
            ->whereKey((string) $validated['run_id'])
            ->exists()) {
            $errors['run_id'] = ['The selected run does not belong to the current user.'];
        }

        if (filled($validated['run_artifact_id'] ?? null)) {
            $artifact = TalosRunArtifact::query()
                ->with('run')
                ->whereKey((string) $validated['run_artifact_id'])
                ->first();

            if (! $artifact instanceof TalosRunArtifact || $artifact->run === null || (int) $artifact->run->user_id !== $userId) {
                $errors['run_artifact_id'] = ['The selected run artifact does not belong to the current user.'];
            } elseif (filled($validated['run_id'] ?? null) && $artifact->run_id !== (string) $validated['run_id']) {
                $errors['run_artifact_id'] = ['The selected run artifact does not belong to the selected run.'];
            }
        }

        if (filled($validated['research_report_id'] ?? null) && ! TalosResearchReport::query()
            ->where('user_id', $userId)
            ->whereKey((string) $validated['research_report_id'])
            ->exists()) {
            $errors['research_report_id'] = ['The selected research report does not belong to the current user.'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
