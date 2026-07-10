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

        $session->delete();

        return response()->json(null, 204);
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
            if (!is_string($key) || $this->isSecretLikeMetadataKey($key)) {
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

        foreach (['favorite', 'archived', 'selected'] as $key) {
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
