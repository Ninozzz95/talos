<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use App\Support\TalosThemeContrast;
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

        $settings = $this->settingsForUpdate((int) $userId);
        $storedPreferences = TalosWorkspaceSetting::sanitizePreferences($settings->preferences ?? []);
        $effectivePreferences = $storedPreferences;

        if (array_key_exists('preferences', $validated)) {
            $themeErrors = TalosWorkspaceSetting::validateThemePreferencesForWrite(
                $validated['preferences'],
                $storedPreferences,
            );
            $effectivePreferences = $this->mergePreferences(
                $storedPreferences,
                $validated['preferences'],
            );
            $themeErrors = array_replace_recursive(
                $themeErrors,
                TalosThemeContrast::validatePreferences($effectivePreferences),
            );
            if ($themeErrors !== []) {
                throw ValidationException::withMessages($themeErrors);
            }
        }

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
            $themePolicyLocked = $this->themePolicyLocked($settings);
            if ($themePolicyLocked && $this->containsLockedThemeChange($effectivePreferences, $storedPreferences)) {
                return response()->json([
                    'message' => 'Theme changes are locked by workspace policy.',
                    'errors' => [
                        'preferences.theme' => ['Theme changes are locked by workspace policy.'],
                    ],
                ], 422);
            }

            $settings->preferences = $effectivePreferences;
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

    private function settingsForUpdate(int $userId): TalosWorkspaceSetting
    {
        return TalosWorkspaceSetting::query()->firstOrNew([
            'user_id' => $userId,
        ], [
            'id' => TalosWorkspaceSetting::idForUser($userId),
            'preferences' => [],
        ]);
    }

    /**
     * @param array<string, mixed> $storedPreferences
     * @return array<string, mixed>
     */
    private function mergePreferences(array $storedPreferences, mixed $rawPreferences): array
    {
        if ($rawPreferences === null) {
            return [];
        }

        if (! is_array($rawPreferences) || $rawPreferences === []) {
            return $storedPreferences;
        }

        return $this->mergePreferenceObjects(
            $storedPreferences,
            TalosWorkspaceSetting::sanitizePreferences($rawPreferences),
        );
    }

    /**
     * @param array<mixed> $stored
     * @param array<mixed> $incoming
     * @return array<mixed>
     */
    private function mergePreferenceObjects(array $stored, array $incoming): array
    {
        $merged = $stored;
        foreach ($incoming as $key => $value) {
            $storedValue = $stored[$key] ?? null;
            $merged[$key] = is_array($value)
                && $value !== []
                && ! array_is_list($value)
                && is_array($storedValue)
                && ! array_is_list($storedValue)
                    ? $this->mergePreferenceObjects($storedValue, $value)
                    : $value;
        }

        return $merged;
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
    private function containsLockedThemeChange(mixed $preferences, array $storedPreferences): bool
    {
        if (! is_array($preferences)) {
            return false;
        }

        $lockedKeys = [
            'theme_policy_locked' => true,
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

        foreach ($lockedKeys as $key => $_locked) {
            if (($preferences[$key] ?? null) !== ($storedPreferences[$key] ?? null)) {
                return true;
            }
        }

        $incomingLayout = $preferences['chat_layout'] ?? null;
        $storedLayout = is_array($storedPreferences['chat_layout'] ?? null)
            ? $storedPreferences['chat_layout']
            : [];
        $effectiveLayout = is_array($incomingLayout) ? $incomingLayout : [];
        foreach (['bubble_scale', 'composer_mode'] as $key) {
            if (($effectiveLayout[$key] ?? null) !== ($storedLayout[$key] ?? null)) {
                return true;
            }
        }

        return false;
    }
}
