<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosSessionController extends Controller
{
    private const WELCOME_PROMPT_IDS = [
        'workflow-handle',
        'evidence-not-vibes',
        'avm-start',
        'replayable-run',
        'system-building',
        'incident-triage',
        'context-ingestion',
        'benchmark-proof',
        'research-brief',
        'operator-handoff',
        'policy-safe',
        'artifact-output',
    ];

    public function index(): JsonResponse
    {
        $sessions = TalosSession::query()
            ->latest('updated_at')
            ->latest('created_at')
            ->get();

        return response()->json(['data' => $sessions]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'mode' => ['sometimes', 'string', Rule::in(['answer_only', 'verified_execution'])],
            'persistence_mode' => ['sometimes', 'string', Rule::in(['persistent', 'temporary'])],
            'active_model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $validated['metadata'] = $this->metadataWithWelcomePrompt($validated['metadata'] ?? []);

        $session = TalosSession::query()->create([
            ...$validated,
            'mode' => $validated['mode'] ?? 'verified_execution',
            'persistence_mode' => $validated['persistence_mode'] ?? 'persistent',
        ]);

        return response()->json(['data' => $session], 201);
    }

    public function show(TalosSession $session): JsonResponse
    {
        return response()->json(['data' => $session]);
    }

    public function update(Request $request, TalosSession $session): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'title' => ['sometimes', 'string', 'min:1', 'max:255'],
            'mode' => ['sometimes', 'string', Rule::in(['answer_only', 'verified_execution'])],
            'persistence_mode' => ['sometimes', 'string', Rule::in(['persistent', 'temporary'])],
            'active_model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $session->update($validated);

        return response()->json(['data' => $session->refresh()]);
    }

    public function destroy(TalosSession $session): JsonResponse
    {
        $session->delete();

        return response()->json(null, 204);
    }

    /**
     * @param mixed $metadata
     * @return array<string, mixed>
     */
    private function metadataWithWelcomePrompt(mixed $metadata): array
    {
        $safe = is_array($metadata) ? $metadata : [];
        $promptId = $safe['welcome_prompt_id'] ?? null;

        if (is_string($promptId) && in_array($promptId, self::WELCOME_PROMPT_IDS, true)) {
            return $safe;
        }

        $safe['welcome_prompt_id'] = self::WELCOME_PROMPT_IDS[random_int(0, count(self::WELCOME_PROMPT_IDS) - 1)];

        return $safe;
    }
}
