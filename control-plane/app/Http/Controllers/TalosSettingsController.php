<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TalosSettingsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);
        $settings = $this->settings((int) $userId);

        return response()->json(['data' => $this->settingsPayload($settings, (int) $userId)]);
    }

    public function update(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $validated = $request->validate([
            'default_model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'default_context_set_id' => ['sometimes', 'nullable', 'string', 'exists:talos_context_sets,id'],
            'preferences' => ['sometimes', 'nullable', 'array'],
        ]);

        $settings = $this->settings((int) $userId);
        $defaultErrors = [];

        if (array_key_exists('default_model_profile_id', $validated)) {
            if (! $this->modelProfileOwned($validated['default_model_profile_id'], $userId)) {
                $defaultErrors['default_model_profile_id'] = ['Default model profile must belong to the authenticated user.'];
            }
        }

        if (array_key_exists('default_context_set_id', $validated)) {
            if (! $this->contextSetOwned($validated['default_context_set_id'], $userId)) {
                $defaultErrors['default_context_set_id'] = ['Default context set must belong to the authenticated user.'];
            }
        }

        if ($defaultErrors !== []) {
            throw ValidationException::withMessages($defaultErrors);
        }

        if (array_key_exists('default_model_profile_id', $validated)) {
            $settings->default_model_profile_id = $validated['default_model_profile_id'];
        }

        if (array_key_exists('default_context_set_id', $validated)) {
            $settings->default_context_set_id = $validated['default_context_set_id'];
        }

        if (array_key_exists('preferences', $validated)) {
            if ($this->themePolicyLocked($settings) && $this->containsThemeWrite($validated['preferences'] ?? [])) {
                return response()->json([
                    'message' => 'Theme changes are locked by workspace policy.',
                    'errors' => [
                        'preferences.theme' => ['Theme changes are locked by workspace policy.'],
                    ],
                ], 422);
            }

            $settings->preferences = TalosWorkspaceSetting::sanitizePreferences($validated['preferences'] ?? []);
        }

        $settings->save();

        return response()->json(['data' => $this->settingsPayload($settings->refresh(), $userId)]);
    }

    private function settings(int $userId): TalosWorkspaceSetting
    {
        return TalosWorkspaceSetting::query()->firstOrCreate([
            'user_id' => $userId,
        ], [
            'id' => TalosWorkspaceSetting::idForUser($userId),
            'preferences' => [],
        ]);
    }

    private function themePolicyLocked(TalosWorkspaceSetting $settings): bool
    {
        $preferences = TalosWorkspaceSetting::sanitizePreferences($settings->preferences ?? []);

        return ($preferences['theme_policy_locked'] ?? false) === true;
    }

    private function modelProfileOwned(mixed $profileId, int $userId): bool
    {
        if ($profileId === null || $profileId === '') {
            return true;
        }

        return TalosModelProfile::query()
            ->whereKey((string) $profileId)
            ->where('user_id', $userId)
            ->exists();
    }

    private function contextSetOwned(mixed $contextSetId, int $userId): bool
    {
        if ($contextSetId === null || $contextSetId === '') {
            return true;
        }

        return TalosContextSet::query()
            ->whereKey((string) $contextSetId)
            ->where('user_id', $userId)
            ->exists();
    }

    /**
     * @return array<string, mixed>
     */
    private function settingsPayload(TalosWorkspaceSetting $settings, int $userId): array
    {
        $payload = $settings->toApiArray();

        if (($payload['default_model_profile_id'] ?? null) !== null
            && ! $this->modelProfileOwned($payload['default_model_profile_id'], $userId)
        ) {
            $payload['default_model_profile_id'] = null;
        }

        if (($payload['default_context_set_id'] ?? null) !== null
            && ! $this->contextSetOwned($payload['default_context_set_id'], $userId)
        ) {
            $payload['default_context_set_id'] = null;
        }

        return $payload;
    }

    /**
     * @param mixed $preferences
     */
    private function containsThemeWrite(mixed $preferences): bool
    {
        if (! is_array($preferences)) {
            return false;
        }

        $themeKeys = [
            'theme' => true,
            'theme_customization' => true,
            'theme_library' => true,
            'active_custom_theme_id' => true,
            'theme_motion' => true,
            'theme_mode' => true,
            'theme_motion_disabled' => true,
            'theme_simple_animation' => true,
            'theme_background_disabled' => true,
            'ui_animation_profile' => true,
            'ui_animation_customization' => true,
            'theme_area_tokens' => true,
            'workspace_default_theme' => true,
        ];

        foreach ($preferences as $key => $value) {
            if (is_string($key) && isset($themeKeys[$key])) {
                return true;
            }

            if (is_array($value) && $this->containsThemeWrite($value)) {
                return true;
            }
        }

        return false;
    }
}
