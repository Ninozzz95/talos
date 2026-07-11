<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use App\Services\Models\TalosModelProviderCatalog;
use App\Services\Prompts\TalosPromptEnhancementException;
use App\Services\Prompts\TalosPromptEnhancementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosPromptEnhancementController extends Controller
{
    public function __construct(private readonly TalosPromptEnhancementService $enhancementService)
    {
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'prompt' => ['required', 'string', 'min:1', 'max:12000'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'session_id' => [
                'sometimes',
                'nullable',
                'string',
                Rule::exists('talos_sessions', 'id')->where(
                    fn ($query) => $query->where('user_id', $user->id),
                ),
            ],
            'api_key' => ['prohibited'],
            'secret' => ['prohibited'],
            'encrypted_secret' => ['prohibited'],
        ]);

        $profile = $this->usableProfile($validated['model_profile_id'] ?? null, $user);
        if (! $profile instanceof TalosModelProfile) {
            $message = 'Prompt enhancement requires a configured server-side model profile.';

            return response()->json([
                'message' => $message,
                'error' => [
                    'code' => 'PROMPT_ENHANCER_UNAVAILABLE',
                    'message' => $message,
                    'retryable' => false,
                ],
            ], 409);
        }

        $prompt = trim((string) $validated['prompt']);
        try {
            $enhancement = $this->enhancementService->enhance($profile, $prompt);
        } catch (TalosPromptEnhancementException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'error' => [
                    'code' => $exception->codeName(),
                    'message' => $exception->getMessage(),
                    'retryable' => $exception->retryable(),
                ],
            ], $exception->httpStatus());
        }

        return response()->json([
            'data' => [
                'model_profile_id' => $profile->id,
                'provider' => $enhancement['provider'],
                'model' => $enhancement['model'],
                'enhancement_mode' => 'model',
                'original_prompt' => $prompt,
                'enhanced_prompt' => $enhancement['enhanced_prompt'],
                'summary' => $enhancement['summary'],
                'applied_principles' => $enhancement['applied_principles'],
            ],
        ]);
    }

    private function usableProfile(?string $profileId, User $user): ?TalosModelProfile
    {
        if (! filled($profileId)) {
            $profileId = TalosWorkspaceSetting::query()
                ->where('user_id', $user->id)
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

        if (TalosModelProviderCatalog::requiresSecret((string) $profile->provider)
            && ! filled($profile->encrypted_secret)) {
            return null;
        }

        if (in_array($profile->status, ['disabled', 'failed'], true)) {
            return null;
        }

        return $profile;
    }
}
