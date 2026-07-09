<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosPromptEnhancementController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'prompt' => ['required', 'string', 'min:1', 'max:12000'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'session_id' => ['sometimes', 'nullable', 'string', 'exists:talos_sessions,id'],
            'api_key' => ['prohibited'],
            'secret' => ['prohibited'],
            'encrypted_secret' => ['prohibited'],
        ]);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $profile = $this->usableProfile($validated['model_profile_id'] ?? null, $user);
        if (! $profile instanceof TalosModelProfile) {
            return response()->json([
                'error' => [
                    'code' => 'PROMPT_ENHANCER_UNAVAILABLE',
                    'message' => 'Prompt enhancement requires a configured server-side model profile.',
                ],
            ], 409);
        }

        $prompt = trim((string) $validated['prompt']);

        return response()->json([
            'data' => [
                'model_profile_id' => $profile->id,
                'enhancement_mode' => 'deterministic_template',
                'original_prompt' => $prompt,
                'enhanced_prompt' => $this->enhancePrompt($prompt),
            ],
        ]);
    }

    private function usableProfile(?string $profileId, User $user): ?TalosModelProfile
    {
        if (! filled($profileId)) {
            $profileId = TalosWorkspaceSetting::query()
                ->whereKey(TalosWorkspaceSetting::DEFAULT_ID)
                ->value('default_model_profile_id');
        }

        if (! filled($profileId)) {
            return null;
        }

        $profile = TalosModelProfile::query()
            ->where('user_id', $user->id)
            ->find((string) $profileId);
        if (! $profile instanceof TalosModelProfile) {
            return null;
        }

        if (! filled($profile->encrypted_secret)) {
            return null;
        }

        if (in_array($profile->status, ['disabled', 'failed'], true)) {
            return null;
        }

        return $profile;
    }

    private function enhancePrompt(string $prompt): string
    {
        return implode("\n\n", [
            'Objective:',
            $prompt,
            'Clarify the expected output, relevant constraints, available context, and acceptance checks before execution.',
        ]);
    }
}
