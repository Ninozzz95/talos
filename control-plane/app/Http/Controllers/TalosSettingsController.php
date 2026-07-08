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
}
