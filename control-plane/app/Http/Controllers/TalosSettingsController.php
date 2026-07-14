<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use App\Services\Talos\Browser\TalosBrowserHmiPolicy;
use App\Support\TalosThemeContrast;
use App\Support\TalosThemeMotionV6;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use JsonException;
use stdClass;
use Throwable;

final class TalosSettingsController extends Controller
{
    public function __construct(private readonly TalosBrowserHmiPolicy $browserHmiPolicy) {}

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

        $rawThemeMotionV6 = $this->extractRawThemeMotionV6($request);
        if ($rawThemeMotionV6['empty']) {
            $settings = $this->settingsForUpdate((int) $userId);

            return response()->json(['data' => $this->settingsPayload($settings, (int) $userId)]);
        }

        $validated = $request->validate([
            'expected_revision' => ['sometimes', 'integer', 'min:0'],
            'default_model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'default_context_set_id' => ['sometimes', 'nullable', 'string', 'exists:talos_context_sets,id'],
            'preferences' => ['sometimes', 'nullable', 'array'],
        ]);
        $this->canonicalizeThemeMotionV6($validated, $rawThemeMotionV6);

        DB::beginTransaction();
        try {
            $settings = $this->settingsForUpdate((int) $userId, true);
            $this->assertExpectedRevision($settings, $validated['expected_revision'] ?? null, (int) $userId);
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
                    TalosWorkspaceSetting::validateBrowserHmiPreferencesForWrite($validated['preferences']),
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
                    throw ValidationException::withMessages([
                        'preferences.theme' => ['Theme changes are locked by workspace policy.'],
                    ]);
                }

                $settings->preferences = $effectivePreferences;
            }

            $settings->revision = ((int) ($settings->revision ?? 0)) + 1;
            $settings->save();
            $settings->refresh();
            DB::commit();

            return response()->json(['data' => $this->settingsPayload($settings, (int) $userId)]);
        } catch (Throwable $exception) {
            DB::rollBack();
            throw $exception;
        }
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

    private function settingsForUpdate(int $userId, bool $lockForUpdate = false): TalosWorkspaceSetting
    {
        $query = TalosWorkspaceSetting::query()->where('user_id', $userId);
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }
        $settings = $query->first();
        if ($settings !== null) {
            return $settings;
        }

        return new TalosWorkspaceSetting([
            'id' => TalosWorkspaceSetting::idForUser($userId),
            'user_id' => $userId,
            'preferences' => [],
            'revision' => 0,
        ]);
    }

    private function assertExpectedRevision(
        TalosWorkspaceSetting $settings,
        mixed $expectedRevision,
        int $userId,
    ): void {
        if ($expectedRevision === null) {
            return;
        }

        $actualRevision = (int) ($settings->revision ?? 0);
        if ((int) $expectedRevision === $actualRevision) {
            return;
        }

        throw new HttpResponseException(response()->json([
            'message' => 'Workspace settings changed in another session. Reload the latest settings and retry your change.',
            'code' => 'TALOS_SETTINGS_REVISION_CONFLICT',
            'errors' => [
                'expected_revision' => ["Expected revision {$expectedRevision}, current revision is {$actualRevision}."],
            ],
            'data' => $this->settingsPayload($settings, $userId),
        ], 409));
    }

    /**
     * @param  array<string, mixed>  $validated
     * @param  array{present: bool, value: mixed, empty: bool}  $rawThemeMotionV6
     */
    private function canonicalizeThemeMotionV6(array &$validated, array $rawThemeMotionV6): void
    {
        $preferences = $validated['preferences'] ?? null;
        if (! is_array($preferences) || ! array_key_exists('theme_motion_v6', $preferences)) {
            return;
        }

        $input = $rawThemeMotionV6['present']
            ? $rawThemeMotionV6['value']
            : $preferences['theme_motion_v6'];

        $result = TalosThemeMotionV6::parse($input);
        if (! $result['success']) {
            throw ValidationException::withMessages(
                TalosThemeMotionV6::validationErrorsForResult($result),
            );
        }

        $validated['preferences']['theme_motion_v6'] = $result['value'];
    }

    /**
     * @return array{present: bool, value: mixed, empty: bool}
     */
    private function extractRawThemeMotionV6(Request $request): array
    {
        if (! $request->isJson()) {
            return ['present' => false, 'value' => null, 'empty' => false];
        }

        $content = $request->getContent();
        if ($content === '' || strspn($content, " \t\r\n") === strlen($content)) {
            return ['present' => false, 'value' => null, 'empty' => true];
        }

        try {
            $root = json_decode($content, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages([
                'preferences.theme_motion_v6' => [
                    'TALOS_THEME_MOTION_V6_SERIALIZATION_ERROR field=preferences.theme_motion_v6: Motion V6 payload could not be serialized safely.',
                ],
            ]);
        }

        if ($root instanceof stdClass
            && $root::class === stdClass::class
            && property_exists($root, 'preferences')
            && $root->preferences instanceof stdClass
            && $root->preferences::class === stdClass::class
            && property_exists($root->preferences, 'theme_motion_v6')
        ) {
            return ['present' => true, 'value' => $root->preferences->theme_motion_v6, 'empty' => false];
        }

        return ['present' => false, 'value' => null, 'empty' => false];
    }

    /**
     * @param  array<string, mixed>  $storedPreferences
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
     * @param  array<mixed>  $stored
     * @param  array<mixed>  $incoming
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

        $userMode = $this->browserHmiPolicy->normalizeMode($payload['preferences']['browser_hmi_mode'] ?? null)
            ?? TalosBrowserHmiPolicy::CONFIRM_SENSITIVE;
        $workspaceMode = $this->browserHmiPolicy->normalizeMode(config('services.talos.browser.hmi_min_mode'));
        $effectiveMode = $this->browserHmiPolicy->effectiveMode($userMode, $workspaceMode);
        $payload['browser_hmi_policy'] = [
            'user_mode' => $userMode,
            'workspace_minimum_mode' => $workspaceMode,
            'effective_mode' => $effectiveMode,
            'preference_constrained' => $effectiveMode !== $userMode,
        ];

        return $payload;
    }

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
            'theme_motion_v6' => true,
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
