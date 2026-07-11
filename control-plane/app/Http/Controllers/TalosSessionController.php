<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use App\Services\Talos\Browser\TalosBrowserArtifactReconciler;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class TalosSessionController extends Controller
{
    public function __construct(
        private readonly TalosBrowserArtifactStore $browserArtifacts,
        private readonly TalosBrowserArtifactReconciler $browserArtifactReconciler,
    ) {}

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

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);
        $validated = $request->validate([
            'surface' => ['sometimes', 'string', Rule::in(['chat', 'browse'])],
        ]);
        $surface = $validated['surface'] ?? 'chat';

        $query = TalosSession::query()
            ->where('user_id', $userId);

        if ($surface === 'chat') {
            $query->whereIn('surface', ['chat', 'browse']);
        } else {
            $query->where('surface', 'browse');
        }

        $sessions = $query
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->each(function (TalosSession $session): void {
                if ($session->surface !== 'browse') {
                    return;
                }

                $metadata = is_array($session->metadata) ? $session->metadata : [];
                $session->metadata = [
                    ...$metadata,
                    'legacy_browse' => true,
                ];
            });

        return response()->json(['data' => $sessions]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $validated = $request->validate([
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'mode' => ['sometimes', 'string', Rule::in(['answer_only', 'verified_execution'])],
            'persistence_mode' => ['sometimes', 'string', Rule::in(['persistent', 'temporary'])],
            'surface' => ['sometimes', 'string', Rule::in(['chat'])],
            'active_model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $validated['metadata'] = [
            ...$this->sanitizeMetadata($validated['metadata'] ?? [], null),
            'surface' => 'chat',
        ];

        $session = TalosSession::query()->create([
            ...$validated,
            'user_id' => $userId,
            'mode' => $validated['mode'] ?? 'verified_execution',
            'persistence_mode' => $validated['persistence_mode'] ?? 'persistent',
            'surface' => 'chat',
        ]);

        return response()->json(['data' => $session], 201);
    }

    public function show(Request $request, TalosSession $session): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        return response()->json(['data' => $session]);
    }

    public function update(Request $request, TalosSession $session): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'min:1', 'max:255'],
            'mode' => ['sometimes', 'string', Rule::in(['answer_only', 'verified_execution'])],
            'persistence_mode' => ['sometimes', 'string', Rule::in(['persistent', 'temporary'])],
            'active_model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        if (array_key_exists('metadata', $validated)) {
            $validated['metadata'] = $this->sanitizeMetadata($validated['metadata'], $session);
        }

        $session->update($validated);

        return response()->json(['data' => $session->refresh()]);
    }

    public function destroy(Request $request, TalosSession $session): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        try {
            $this->browserArtifactReconciler->reconcileForSession((string) $session->id, (int) $session->user_id);
            $this->browserArtifactReconciler->persistPending((string) $session->id, (int) $session->user_id);
        } catch (\Throwable $exception) {
            report($exception);

            return $this->deleteFailureResponse();
        }

        $receipt = [];

        try {
            DB::transaction(function () use ($session, &$receipt): void {
                $lockedSession = TalosSession::query()
                    ->whereKey($session->id)
                    ->where('user_id', $session->user_id)
                    ->lockForUpdate()
                    ->first();

                if (! $lockedSession instanceof TalosSession) {
                    throw new \RuntimeException('Talos session deletion failed.');
                }

                $this->browserArtifacts->deleteForChat($lockedSession, $receipt);

                if ($lockedSession->delete() !== true) {
                    throw new \RuntimeException('Talos session deletion failed.');
                }
            });
        } catch (\Throwable $exception) {
            report($exception);

            $restored = $receipt === [];
            if ($receipt !== []) {
                try {
                    $this->browserArtifacts->restore($receipt);
                    $restored = true;
                } catch (\Throwable $restoreException) {
                    report($restoreException);

                    try {
                        $this->browserArtifactReconciler->persistPending((string) $session->id, (int) $session->user_id);
                    } catch (\Throwable $pendingException) {
                        report($pendingException);
                    }

                    $this->browserArtifactReconciler->auditDeferred((string) $session->id, $receipt, 'rollback_compensation');
                }
            }

            if ($restored) {
                try {
                    $this->browserArtifactReconciler->reconcileForSession((string) $session->id, (int) $session->user_id);
                } catch (\Throwable $releaseException) {
                    report($releaseException);
                }
            }

            return $this->deleteFailureResponse();
        }

        try {
            $this->browserArtifacts->finalize($receipt);
        } catch (\Throwable $finalizeException) {
            report($finalizeException);
            $this->browserArtifactReconciler->auditDeferred((string) $session->id, $receipt, 'post_commit_finalize');
        }

        return response()->json(null, 204);
    }

    private function deleteFailureResponse(): JsonResponse
    {
        return response()->json([
            'code' => 'TALOS_SESSION_DELETE_FAILED',
            'message' => 'Chat session could not be deleted.',
            'details' => [],
        ], 500);
    }

    /**
     * @param mixed $metadata
     * @return array<string, mixed>
     */
    private function sanitizeMetadata(mixed $metadata, ?TalosSession $session): array
    {
        $existingRaw = is_array($session?->metadata) ? $session->metadata : [];
        $incomingRaw = is_array($metadata) ? $metadata : [];
        $existing = $this->sanitizeMetadataFields($existingRaw);
        $incoming = $this->sanitizeMetadataFields($incomingRaw);

        if (isset($existing['chat_state'], $incoming['chat_state'])
            && is_array($existing['chat_state'])
            && is_array($incoming['chat_state'])
        ) {
            $incoming['chat_state'] = [
                ...$existing['chat_state'],
                ...$incoming['chat_state'],
            ];
        }

        $safe = [
            ...$existing,
            ...$incoming,
        ];

        $promptId = $existingRaw['welcome_prompt_id'] ?? ($session === null ? ($incomingRaw['welcome_prompt_id'] ?? null) : null);

        if (is_string($promptId) && in_array($promptId, self::WELCOME_PROMPT_IDS, true)) {
            $safe['welcome_prompt_id'] = $promptId;

            return $safe;
        }

        $safe['welcome_prompt_id'] = self::WELCOME_PROMPT_IDS[random_int(0, count(self::WELCOME_PROMPT_IDS) - 1)];

        return $safe;
    }

    /**
     * @param array<mixed> $metadata
     * @return array<string, mixed>
     */
    private function sanitizeMetadataFields(array $metadata): array
    {
        $safe = [];

        foreach ($metadata as $key => $value) {
            if (!is_string($key) || $this->isSecretLikeMetadataKey($key) || $key === TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY) {
                continue;
            }

            if ($key === 'welcome_prompt_id') {
                continue;
            }

            if ($key === 'chat_state') {
                $safe[$key] = $this->sanitizeChatState($value);
                continue;
            }

            $sanitizedValue = $this->sanitizeMetadataValue($value);
            if ($sanitizedValue !== null) {
                $safe[$key] = $sanitizedValue;
            }
        }

        return $safe;
    }

    /**
     * @return array<string, mixed>
     */
    private function sanitizeChatState(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $safe = [];

        foreach (['favorite', 'archived', 'selected', 'browse_enabled'] as $key) {
            if (array_key_exists($key, $value)) {
                $safe[$key] = filter_var($value[$key], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
            }
        }

        foreach (['folder', 'copied_from_session_id'] as $key) {
            if (!array_key_exists($key, $value) || !is_scalar($value[$key])) {
                continue;
            }

            $text = trim((string) $value[$key]);
            if ($text !== '') {
                $safe[$key] = mb_substr($text, 0, 120);
            }
        }

        return $safe;
    }

    private function sanitizeMetadataValue(mixed $value): mixed
    {
        if ($value === null || is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        if (is_string($value)) {
            $text = trim($value);

            return $text === '' || str_contains(strtolower($text), '<script') ? null : mb_substr($text, 0, 500);
        }

        if (!is_array($value)) {
            return null;
        }

        $safe = [];
        foreach ($value as $key => $nestedValue) {
            if (!is_string($key) || $this->isSecretLikeMetadataKey($key)) {
                continue;
            }

            $sanitizedValue = $this->sanitizeMetadataValue($nestedValue);
            if ($sanitizedValue !== null) {
                $safe[$key] = $sanitizedValue;
            }
        }

        return $safe;
    }

    private function isSecretLikeMetadataKey(string $key): bool
    {
        $normalized = strtolower(str_replace(['-', ' '], '_', $key));

        return str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
            || str_contains($normalized, 'api_key')
            || str_contains($normalized, 'authorization')
            || str_contains($normalized, 'credential')
            || str_contains($normalized, 'private_key')
            || $normalized === 'token'
            || str_ends_with($normalized, '_token')
            || str_ends_with($normalized, '-token');
    }

    private function abortUnlessOwnedByCurrentUser(Request $request, TalosSession $session): void
    {
        abort_unless($request->user()?->id === $session->user_id, 404);
    }
}
