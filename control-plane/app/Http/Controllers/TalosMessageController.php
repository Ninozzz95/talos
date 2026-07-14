<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use App\Services\Talos\Browser\TalosBrowserActivityProjector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosMessageController extends Controller
{
    public function index(
        Request $request,
        TalosSession $session,
        TalosBrowserActivityProjector $browserActivityProjector,
    ): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        $messages = $session->messages()
            ->oldest('created_at')
            ->oldest('id')
            ->get();
        $browserActivityProjector->projectMissingForSession($messages, $session);

        return response()->json(['data' => $messages]);
    }

    public function store(Request $request, TalosSession $session): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        $sameSessionMessage = static fn () => Rule::exists('talos_messages', 'id')
            ->where(static fn ($query) => $query->where('session_id', $session->id));

        $validated = $request->validate([
            'role' => ['required', 'string', Rule::in(['user', 'assistant', 'system', 'tool'])],
            'content' => ['required', 'string', 'min:1', 'max:20000'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'run_id' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
                Rule::exists('talos_runs', 'id')->where('session_id', $session->id),
            ],
            'metadata' => [
                'sometimes',
                'nullable',
                'array',
                static function (string $attribute, mixed $value, \Closure $fail): void {
                    if (self::containsSecretLikeKey($value)) {
                        $fail('The metadata contains secret-like keys and cannot be persisted.');
                    }
                },
            ],
            'metadata.command_id' => ['sometimes', 'string', 'max:120'],
            'metadata.copy_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.edit_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.retry_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.resend_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
        ]);

        if ($request->has('metadata')) {
            $metadata = $request->input('metadata');
            if (is_array($metadata)) {
                unset($metadata['browser_activities'], $metadata['used_browser_context']);
            }
            $validated['metadata'] = $metadata;
        }

        $message = $session->messages()->create($validated);

        return response()->json(['data' => $message], 201);
    }

    private static function containsSecretLikeKey(mixed $value): bool
    {
        if (! is_array($value)) {
            return false;
        }

        foreach ($value as $key => $nestedValue) {
            if (is_string($key) && self::isSecretLikeKey($key)) {
                return true;
            }

            if (self::containsSecretLikeKey($nestedValue)) {
                return true;
            }
        }

        return false;
    }

    private static function isSecretLikeKey(string $key): bool
    {
        $normalized = strtolower(str_replace(['-', ' '], '_', $key));

        $tokenMetricKeys = [
            'cached_tokens',
            'completion_tokens',
            'input_tokens',
            'output_tokens',
            'prompt_tokens',
            'reasoning_tokens',
            'token_count',
            'token_estimate',
            'tokens',
            'total_tokens',
        ];

        $tokenMetricPrefixes = [
            'accepted_prediction',
            'audio',
            'cache_creation_input',
            'cache_read_input',
            'cached',
            'completion',
            'image',
            'input',
            'output',
            'prompt',
            'reasoning',
            'rejected_prediction',
            'text',
            'total',
        ];

        if (in_array($normalized, $tokenMetricKeys, true)
            || str_ends_with($normalized, '_token_count')
            || str_ends_with($normalized, '_token_estimate')
        ) {
            return false;
        }

        foreach ($tokenMetricPrefixes as $prefix) {
            if ($normalized === $prefix . '_tokens') {
                return false;
            }
        }

        return str_contains($normalized, 'api_key')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
            || $normalized === 'token'
            || str_contains($normalized, 'access_token')
            || str_contains($normalized, 'api_token')
            || str_contains($normalized, 'auth_token')
            || str_contains($normalized, 'bearer_token')
            || str_contains($normalized, 'client_token')
            || str_contains($normalized, 'csrf_token')
            || str_contains($normalized, 'id_token')
            || str_contains($normalized, 'refresh_token')
            || str_contains($normalized, 'session_token')
            || str_contains($normalized, 'token_hash')
            || str_contains($normalized, 'token_value');
    }

    private function abortUnlessOwnedByCurrentUser(Request $request, TalosSession $session): void
    {
        abort_unless($request->user()?->id === $session->user_id, 404);
    }
}
