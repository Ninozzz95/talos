<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosWorkspaceSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $settings = $this->settings();

        return response()->json(['data' => $settings->toApiArray()]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'default_model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'default_context_set_id' => ['sometimes', 'nullable', 'string', 'exists:talos_context_sets,id'],
            'preferences' => ['sometimes', 'nullable', 'array'],
        ]);

        $settings = $this->settings();

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

        return response()->json(['data' => $settings->refresh()->toApiArray()]);
    }

    private function settings(): TalosWorkspaceSetting
    {
        return TalosWorkspaceSetting::query()->firstOrCreate([
            'id' => TalosWorkspaceSetting::DEFAULT_ID,
        ], [
            'preferences' => [],
        ]);
    }

    private function themePolicyLocked(TalosWorkspaceSetting $settings): bool
    {
        $preferences = TalosWorkspaceSetting::sanitizePreferences($settings->preferences ?? []);

        return ($preferences['theme_policy_locked'] ?? false) === true;
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
