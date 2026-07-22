<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\TalosThemeMotionV6;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use JsonException;
use stdClass;

final class TalosWorkspaceSetting extends Model
{
    public const DEFAULT_ID = 'default';

    public const SENSITIVE_CENSOR_DEFAULT = true;

    private const BROWSER_HMI_MODE_VALUES = [
        'read_only' => true,
        'confirm_sensitive' => true,
        'confirm_every_interaction' => true,
    ];

    private const SIDEBAR_RAIL_ITEM_VALUES = [
        'runtime' => true,
        'calendar' => true,
        'compare' => true,
        'model_lab' => true,
        'research' => true,
        'gallery' => true,
        'library' => true,
        'browse' => true,
    ];

    private const SIDEBAR_RAIL_GROUP_VALUES = [
        'workbench' => true,
    ];

    private const SIDEBAR_RAIL_KEYS = [
        'order' => true,
        'collapsed_groups' => true,
        'collapsed' => true,
    ];

    private const ONBOARDING_KEYS = [
        'intro_version' => true,
        'intro_outcome' => true,
    ];

    private const ONBOARDING_OUTCOME_VALUES = [
        'completed' => true,
        'skipped' => true,
    ];

    private const THEME_COLOR_KEYS = [
        'background' => true,
        'panel' => true,
        'text' => true,
        'accent' => true,
        'secondary' => true,
        'border' => true,
    ];

    private const THEME_AREA_COLOR_KEYS = [
        'background' => true,
        'surface' => true,
        'text' => true,
        'muted' => true,
        'border' => true,
        'accent' => true,
    ];

    private const THEME_VALUES = [
        'telemetry' => true,
        'forge' => true,
        'paper' => true,
        'terminal' => true,
        'aurora' => true,
        'glacier' => true,
        'ember' => true,
        'atlas' => true,
        'noir' => true,
        'signal' => true,
        'violet' => true,
        'claudius' => true,
        'basicus' => true,
    ];

    private const LEGACY_THEME_VALUES = [
        'dark' => 'forge',
        'light' => 'paper',
    ];

    private const THEME_CUSTOMIZATION_KEYS = [
        'background' => true,
        'panel' => true,
        'text' => true,
        'accent' => true,
        'secondary' => true,
        'border' => true,
        'font' => true,
        'density' => true,
        'radius' => true,
        'effect' => true,
        'effect_intensity' => true,
        'scrollbar_track' => true,
        'scrollbar_thumb' => true,
        'scrollbar_thumb_hover' => true,
        'scrollbar_width' => true,
    ];

    private const THEME_LIBRARY_RECORD_KEYS = [
        'id' => true,
        'name' => true,
        'base_theme' => true,
        'theme_mode' => true,
        'tokens' => true,
        'area_tokens' => true,
        'motion' => true,
        'motion_v6' => true,
        'ui_animation_profile' => true,
        'ui_animation_customization' => true,
        'chat_layout' => true,
        'created_at' => true,
        'updated_at' => true,
    ];

    private const THEME_PREFERENCE_KEYS = [
        'theme' => true,
        'workspace_default_theme' => true,
        'theme_customization' => true,
        'theme_library' => true,
        'active_custom_theme_id' => true,
        'theme_motion' => true,
        'theme_mode' => true,
        'theme_motion_disabled' => true,
        'theme_simple_animation' => true,
        'theme_background_disabled' => true,
        'theme_policy_locked' => true,
        'theme_motion_v6' => true,
        'ui_animation_profile' => true,
        'ui_animation_customization' => true,
        'theme_area_tokens' => true,
        'chat_layout' => true,
    ];

    private const THEME_LIBRARY_MAX_RECORDS = 50;

    private const THEME_TIMESTAMP_MAX_LENGTH = 64;

    private const THEME_MOTION_VALUES = [
        'system' => true,
        'off' => true,
        'subtle' => true,
        'normal' => true,
        'cinematic' => true,
    ];

    private const THEME_MODE_VALUES = [
        'system' => true,
        'light' => true,
        'dark' => true,
    ];

    private const UI_ANIMATION_PROFILE_VALUES = [
        'preset' => true,
        'minimal' => true,
        'expressive' => true,
        'custom' => true,
        'off' => true,
    ];

    private const UI_ANIMATION_OPEN_CLOSE_VALUES = [
        'instant' => true,
        'standard' => true,
        'depth' => true,
        'terminal-snap' => true,
        'soft-fade' => true,
    ];

    private const UI_ANIMATION_SURFACE_TRANSITION_VALUES = [
        'fade' => true,
        'slide-fade' => true,
        'scale-fade' => true,
        'scanline' => true,
        'axis-shift' => true,
    ];

    private const UI_ANIMATION_FEEDBACK_VALUES = [
        'none' => true,
        'pulse' => true,
        'trace' => true,
        'edge-flash' => true,
        'status-lock' => true,
    ];

    private const UI_ANIMATION_HOVER_VALUES = [
        'none' => true,
        'lift' => true,
        'edge-glow' => true,
        'underline' => true,
        'node-glow' => true,
    ];

    private const UI_ANIMATION_EASING_VALUES = [
        'precise' => true,
        'soft' => true,
        'elastic-light' => true,
        'linear' => true,
        'cinematic' => true,
    ];

    private const THEME_AREAS = [
        'sidebar' => true,
        'chat' => true,
        'composer' => true,
        'window' => true,
        'header' => true,
        'button' => true,
        'card' => true,
        'code' => true,
    ];

    private const APPEARANCE_VISIBILITY_GROUPS = [
        'chat_area' => [
            'session_header' => true,
            'full_width_chat' => true,
            'welcome_message' => true,
            'mission_path' => true,
            'incognito' => true,
            'text_only_emoji_output' => true,
            'thinking_process' => true,
            'sensitive_blur' => true,
        ],
        'chat_bar' => [
            'web_search' => true,
            'document_editor' => true,
            'shell' => true,
            'more_tools' => true,
            'agent_mode_switcher' => true,
            'attach_files' => true,
            'deep_research' => true,
            'personas' => true,
        ],
        'sidebar' => [
            'brand_name' => true,
            'search' => true,
            'new_chat' => true,
            'chats' => true,
            'email' => true,
            'models' => true,
            'tools' => true,
            'brain' => true,
            'calendar' => true,
            'compare' => true,
            'cookbook' => true,
            'deep_research' => true,
            'gallery' => true,
            'library' => true,
            'notes' => true,
            'tasks' => true,
            'theme' => true,
            'user' => true,
            'settings_button' => true,
        ],
    ];

    private const KEYBOARD_SHORTCUT_ACTIONS = [
        'search_conversations' => true,
        'toggle_sidebar' => true,
        'focus_chat_input' => true,
        'toggle_active_window' => true,
        'new_session' => true,
        'cancel_close' => true,
        'open_calendar' => true,
        'open_compare' => true,
        'open_cookbook' => true,
        'open_deep_research' => true,
        'open_gallery' => true,
        'open_library' => true,
        'open_memory' => true,
        'open_notes' => true,
        'open_tasks' => true,
        'open_theme' => true,
    ];

    private const CHAT_BUBBLE_SCALE_VALUES = [
        'compact' => true,
        'balanced' => true,
        'expanded' => true,
    ];

    private const CHAT_COMPOSER_MODE_VALUES = [
        'full' => true,
        'minimal' => true,
    ];

    private const CHAT_MESSAGE_STYLE_VALUES = [
        'sections' => true,
        'bubbles' => true,
    ];

    private const CHAT_MOBILE_WINDOW_PRESENTATION_VALUES = [
        'drawer' => true,
        'fullscreen' => true,
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'default_model_profile_id',
        'default_context_set_id',
        'preferences',
        'revision',
    ];

    public static function idForUser(int $userId): string
    {
        return 'user-'.$userId;
    }

    public static function sensitiveCensorEnabled(mixed $preferences): bool
    {
        $preferences = self::sanitizePreferences($preferences);

        return $preferences['sensitive_censor'] ?? self::SENSITIVE_CENSOR_DEFAULT;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'default_model_profile_id' => $this->default_model_profile_id,
            'default_context_set_id' => $this->default_context_set_id,
            'preferences' => self::sanitizePreferences(
                $this->preferences ?? [],
                $this->getRawOriginal('preferences'),
            ),
            'revision' => (int) ($this->revision ?? 0),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /**
     * @return array<mixed>
     */
    public static function sanitizePreferences(mixed $preferences, mixed $rawPreferencesJson = null): array
    {
        if (! is_array($preferences)) {
            return [];
        }

        $safe = [];
        foreach ($preferences as $key => $value) {
            if (is_string($key) && self::isSecretPreferenceKey($key)) {
                continue;
            }

            if ($key === 'theme' || $key === 'workspace_default_theme') {
                $theme = self::normalizeThemeValue($value);
                if ($theme !== null) {
                    $safe[$key] = $theme;
                }

                continue;
            }

            if ($key === 'theme_customization') {
                $customization = self::sanitizeThemeCustomization($value);
                if ($customization !== [] || $value === []) {
                    $safe[$key] = $customization;
                }

                continue;
            }

            if ($key === 'theme_library') {
                $library = self::sanitizeThemeLibrary($value);
                if ($library !== [] || $value === []) {
                    $safe[$key] = $library;
                }

                continue;
            }

            if ($key === 'theme_motion') {
                if (is_string($value) && isset(self::THEME_MOTION_VALUES[$value])) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'theme_motion_v6') {
                $parsed = TalosThemeMotionV6::parse($value);
                if ($parsed['success']) {
                    $safe[$key] = $parsed['value'];
                }

                continue;
            }

            if ($key === 'theme_mode') {
                if (is_string($value) && isset(self::THEME_MODE_VALUES[$value])) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'active_custom_theme_id') {
                if ($value === null) {
                    $safe[$key] = null;
                } elseif (is_string($value) && self::normalizeThemeId($value) !== null) {
                    $safe[$key] = self::normalizeThemeId($value);
                }

                continue;
            }

            if (in_array($key, [
                'theme_motion_disabled',
                'theme_simple_animation',
                'theme_background_disabled',
                'theme_policy_locked',
                'sensitive_censor',
            ], true)) {
                if (is_bool($value)) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'ui_animation_profile') {
                if (is_string($value) && isset(self::UI_ANIMATION_PROFILE_VALUES[$value])) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'ui_animation_customization') {
                $customization = self::sanitizeUiAnimationCustomization($value);
                if ($customization !== [] || $value === []) {
                    $safe[$key] = $customization;
                }

                continue;
            }

            if ($key === 'theme_area_tokens') {
                $areaTokens = self::sanitizeThemeAreaTokens($value);
                if ($areaTokens !== [] || $value === []) {
                    $safe[$key] = $areaTokens;
                }

                continue;
            }

            if ($key === 'appearance_visibility') {
                $visibility = self::sanitizeAppearanceVisibility($value);
                if ($visibility !== [] || $value === []) {
                    $safe[$key] = $visibility;
                }

                continue;
            }

            if ($key === 'keyboard_shortcuts') {
                $shortcuts = self::sanitizeKeyboardShortcuts($value);
                if ($shortcuts !== [] || $value === []) {
                    $safe[$key] = $shortcuts;
                }

                continue;
            }

            if ($key === 'chat_layout') {
                $layout = self::sanitizeChatLayout($value);
                if ($layout !== [] || $value === []) {
                    $safe[$key] = $layout;
                }

                continue;
            }

            if ($key === 'browser_hmi_mode') {
                if (is_string($value) && isset(self::BROWSER_HMI_MODE_VALUES[$value])) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'sidebar_rail') {
                $rail = self::sanitizeSidebarRail($value);
                if ($rail !== null) {
                    $safe[$key] = $rail;
                }

                continue;
            }

            if ($key === 'onboarding') {
                $onboarding = self::sanitizeOnboardingValue($value, false);
                if ($onboarding !== null) {
                    $safe[$key] = $onboarding;
                }

                continue;
            }

            if (is_string($key) && self::isThemePreferenceKeyCandidate($key)) {
                continue;
            }

            $safe[$key] = is_array($value) ? self::sanitizePreferences($value) : $value;
        }

        return self::applyRawOnboardingShape(
            self::applyRawSidebarRailShape($safe, $rawPreferencesJson),
            $rawPreferencesJson,
        );
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateBrowserHmiPreferencesForWrite(mixed $preferences): array
    {
        if (! is_array($preferences) || ! array_key_exists('browser_hmi_mode', $preferences)) {
            return [];
        }

        $mode = $preferences['browser_hmi_mode'];
        if (! is_string($mode) || ! isset(self::BROWSER_HMI_MODE_VALUES[$mode])) {
            return [
                'preferences.browser_hmi_mode' => [
                    'Browser interaction policy must be read_only, confirm_sensitive, or confirm_every_interaction.',
                ],
            ];
        }

        return [];
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateSidebarRailPreferencesForWrite(mixed $preferences): array
    {
        if (! is_array($preferences) || ! array_key_exists('sidebar_rail', $preferences)) {
            return [];
        }

        return self::validateSidebarRailValueForWrite($preferences['sidebar_rail'], false);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateRawSidebarRailForWrite(mixed $rail): array
    {
        return self::validateSidebarRailValueForWrite($rail, true);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateOnboardingPreferencesForWrite(mixed $preferences): array
    {
        if (! is_array($preferences) || ! array_key_exists('onboarding', $preferences)) {
            return [];
        }

        return self::validateOnboardingValueForWrite($preferences['onboarding'], false);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateRawOnboardingForWrite(mixed $onboarding): array
    {
        return self::validateOnboardingValueForWrite($onboarding, true);
    }

    /**
     * @return array<string, array<int, string>>
     */
    private static function validateOnboardingValueForWrite(mixed $onboarding, bool $rawJson): array
    {
        $path = 'preferences.onboarding';
        if ($rawJson) {
            if (! $onboarding instanceof stdClass || $onboarding::class !== stdClass::class) {
                return [$path => ['Onboarding preferences must be an object.']];
            }

            $onboarding = get_object_vars($onboarding);
        } elseif (! is_array($onboarding) || array_is_list($onboarding)) {
            return [$path => ['Onboarding preferences must be an object.']];
        }

        $errors = [];
        foreach ($onboarding as $key => $_value) {
            if (! is_string($key) || ! isset(self::ONBOARDING_KEYS[$key])) {
                $errorPath = is_string($key) ? "{$path}.{$key}" : $path;
                $errors[$errorPath] = ['Unknown onboarding preference key.'];
            }
        }

        foreach (self::ONBOARDING_KEYS as $key => $_allowed) {
            if (! array_key_exists($key, $onboarding)) {
                $errors["{$path}.{$key}"] = ['Onboarding preference is required.'];
            }
        }

        if (array_key_exists('intro_version', $onboarding)
            && (! is_int($onboarding['intro_version'])
                || $onboarding['intro_version'] < 1
                || $onboarding['intro_version'] > 65535)
        ) {
            $errors["{$path}.intro_version"] = ['Intro version must be an integer from 1 through 65535.'];
        }

        if (array_key_exists('intro_outcome', $onboarding)
            && (! is_string($onboarding['intro_outcome'])
                || ! isset(self::ONBOARDING_OUTCOME_VALUES[$onboarding['intro_outcome']]))
        ) {
            $errors["{$path}.intro_outcome"] = ['Intro outcome must be completed or skipped.'];
        }

        return $errors;
    }

    /**
     * @return array<string, array<int, string>>
     */
    private static function validateSidebarRailValueForWrite(mixed $rail, bool $rawJson): array
    {
        $path = 'preferences.sidebar_rail';
        if ($rawJson) {
            if (! $rail instanceof stdClass || $rail::class !== stdClass::class) {
                return [$path => ['Sidebar rail preferences must be an object.']];
            }

            $rail = get_object_vars($rail);
        } elseif (! is_array($rail) || array_is_list($rail)) {
            return [$path => ['Sidebar rail preferences must be an object.']];
        }

        $errors = [];
        foreach ($rail as $key => $_value) {
            if (! is_string($key) || ! isset(self::SIDEBAR_RAIL_KEYS[$key])) {
                $errorPath = is_string($key) ? "{$path}.{$key}" : $path;
                $errors[$errorPath] = ['Unknown sidebar rail preference key.'];
            }
        }

        foreach (self::SIDEBAR_RAIL_KEYS as $key => $_allowed) {
            if (! array_key_exists($key, $rail)) {
                $errors["{$path}.{$key}"] = ['Sidebar rail preference is required.'];
            }
        }

        if (array_key_exists('order', $rail)) {
            $orderPath = "{$path}.order";
            $order = $rail['order'];
            if (! is_array($order) || ! array_is_list($order)) {
                $errors[$orderPath] = ['Sidebar rail order must be a list.'];
            } else {
                if (count($order) > count(self::SIDEBAR_RAIL_ITEM_VALUES)) {
                    $errors[$orderPath] = ['Sidebar rail order contains too many items.'];
                }

                $seen = [];
                foreach ($order as $index => $itemId) {
                    $itemPath = "{$orderPath}.{$index}";
                    if (! is_string($itemId) || ! isset(self::SIDEBAR_RAIL_ITEM_VALUES[$itemId])) {
                        $errors[$itemPath] = ['Sidebar rail item is not recognized.'];

                        continue;
                    }

                    if (isset($seen[$itemId])) {
                        $errors[$itemPath] = ['Sidebar rail items must be unique.'];

                        continue;
                    }

                    $seen[$itemId] = true;
                }
            }
        }

        if (array_key_exists('collapsed_groups', $rail)) {
            $groupsPath = "{$path}.collapsed_groups";
            $groups = $rail['collapsed_groups'];
            if (! is_array($groups) || ! array_is_list($groups)) {
                $errors[$groupsPath] = ['Collapsed sidebar groups must be a list.'];
            } else {
                if (count($groups) > count(self::SIDEBAR_RAIL_GROUP_VALUES)) {
                    $errors[$groupsPath] = ['Too many collapsed sidebar groups were provided.'];
                }

                $seen = [];
                foreach ($groups as $index => $groupId) {
                    $groupPath = "{$groupsPath}.{$index}";
                    if (! is_string($groupId) || ! isset(self::SIDEBAR_RAIL_GROUP_VALUES[$groupId])) {
                        $errors[$groupPath] = ['Sidebar rail group is not recognized.'];

                        continue;
                    }

                    if (isset($seen[$groupId])) {
                        $errors[$groupPath] = ['Collapsed sidebar groups must be unique.'];

                        continue;
                    }

                    $seen[$groupId] = true;
                }
            }
        }

        if (array_key_exists('collapsed', $rail) && ! is_bool($rail['collapsed'])) {
            $errors["{$path}.collapsed"] = ['Sidebar rail collapsed state must be a boolean.'];
        }

        return $errors;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validateThemePreferencesForWrite(mixed $preferences, mixed $storedPreferences = []): array
    {
        if ($preferences === null) {
            return [];
        }

        if (! is_array($preferences)) {
            return ['preferences' => ['Preferences must be an object.']];
        }

        if ($preferences === []) {
            return [];
        }

        $errors = [];
        foreach ($preferences as $key => $value) {
            if (! is_string($key)) {
                self::addThemeWriteError($errors, 'preferences', 'Preference keys must be strings.');

                continue;
            }

            if (isset(self::THEME_PREFERENCE_KEYS[$key])) {
                self::validateThemePreference($key, $value, $errors);

                continue;
            }

            if (self::isThemePreferenceKeyCandidate($key)) {
                self::addThemeWriteError($errors, "preferences.{$key}", 'Unknown theme preference key.');
            }
        }

        self::validateActiveCustomThemeIdForWrite($preferences, $storedPreferences, $errors);

        return $errors;
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemePreference(string $key, mixed $value, array &$errors): void
    {
        $path = "preferences.{$key}";

        if (in_array($key, ['theme', 'workspace_default_theme'], true)) {
            self::validateThemeEnum($value, self::THEME_VALUES, $path, 'Theme must be a supported preset.', $errors);

            return;
        }

        if (in_array($key, ['theme_motion'], true)) {
            self::validateThemeEnum($value, self::THEME_MOTION_VALUES, $path, 'Theme motion must be a supported mode.', $errors);

            return;
        }

        if ($key === 'theme_motion_v6') {
            $errors = array_replace_recursive($errors, TalosThemeMotionV6::validationErrors($value));

            return;
        }

        if ($key === 'theme_mode') {
            self::validateThemeEnum($value, self::THEME_MODE_VALUES, $path, 'Theme mode must be system, light, or dark.', $errors);

            return;
        }

        if ($key === 'ui_animation_profile') {
            self::validateThemeEnum($value, self::UI_ANIMATION_PROFILE_VALUES, $path, 'UI animation profile is invalid.', $errors);

            return;
        }

        if (in_array($key, [
            'theme_motion_disabled',
            'theme_simple_animation',
            'theme_background_disabled',
            'theme_policy_locked',
        ], true)) {
            if (! is_bool($value)) {
                self::addThemeWriteError($errors, $path, 'Theme setting must be a boolean.');
            }

            return;
        }

        if ($key === 'active_custom_theme_id') {
            if ($value !== null && (! is_string($value) || self::normalizeThemeId($value) === null)) {
                self::addThemeWriteError($errors, $path, 'Active custom theme ID must be a safe string or null.');
            }

            return;
        }

        if ($key === 'theme_customization') {
            self::validateThemeCustomizationForWrite($value, $path, $errors);

            return;
        }

        if ($key === 'theme_library') {
            self::validateThemeLibraryForWrite($value, $path, $errors);

            return;
        }

        if ($key === 'theme_area_tokens') {
            self::validateThemeAreaTokensForWrite($value, $path, $errors);

            return;
        }

        if ($key === 'ui_animation_customization') {
            self::validateUiAnimationCustomizationForWrite($value, $path, $errors);

            return;
        }

        if ($key === 'chat_layout') {
            self::validateChatLayoutForWrite($value, $path, $errors);
        }
    }

    /**
     * @param  array<string, bool>  $allowed
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeEnum(mixed $value, array $allowed, string $path, string $message, array &$errors): void
    {
        if (! is_string($value) || ! isset($allowed[$value])) {
            self::addThemeWriteError($errors, $path, $message);
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeCustomizationForWrite(mixed $value, string $path, array &$errors): void
    {
        if (! is_array($value)) {
            self::addThemeWriteError($errors, $path, 'Theme customization must be an object.');

            return;
        }

        foreach ($value as $key => $tokenValue) {
            $tokenPath = "{$path}.{$key}";
            if (! is_string($key) || ! isset(self::THEME_CUSTOMIZATION_KEYS[$key])) {
                self::addThemeWriteError($errors, $tokenPath, 'Unknown theme customization key.');

                continue;
            }

            if (isset(self::THEME_COLOR_KEYS[$key]) || in_array($key, ['scrollbar_track', 'scrollbar_thumb', 'scrollbar_thumb_hover'], true)) {
                self::validateThemeColor($tokenValue, $tokenPath, $errors);

                continue;
            }

            if ($key === 'font') {
                self::validateThemeEnum($tokenValue, [
                    'inter' => true,
                    'manrope' => true,
                    'mono' => true,
                    'system' => true,
                    'display' => true,
                    'serif' => true,
                ], $tokenPath, 'Theme font is invalid.', $errors);

                continue;
            }

            if ($key === 'density') {
                self::validateThemeEnum($tokenValue, [
                    'compact' => true,
                    'comfortable' => true,
                    'spacious' => true,
                ], $tokenPath, 'Theme density is invalid.', $errors);

                continue;
            }

            if ($key === 'radius') {
                self::validateThemeEnum($tokenValue, [
                    'sharp' => true,
                    'balanced' => true,
                    'soft' => true,
                ], $tokenPath, 'Theme radius is invalid.', $errors);

                continue;
            }

            if ($key === 'effect') {
                self::validateThemeEnum($tokenValue, [
                    'dag-flow' => true,
                    'kahn-grid' => true,
                    'trace-rain' => true,
                    'signal-mesh' => true,
                    'none' => true,
                ], $tokenPath, 'Theme background effect is invalid.', $errors);

                continue;
            }

            if ($key === 'effect_intensity') {
                self::validateThemeNumber($tokenValue, 0, 100, $tokenPath, 'Theme effect intensity must be between 0 and 100.', $errors);

                continue;
            }

            if ($key === 'scrollbar_width') {
                self::validateThemeNumber($tokenValue, 6, 18, $tokenPath, 'Scrollbar width must be between 6 and 18.', $errors);
            }
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeLibraryForWrite(mixed $value, string $path, array &$errors): void
    {
        if (! is_array($value) || ! array_is_list($value)) {
            self::addThemeWriteError($errors, $path, 'Theme library must be a list.');

            return;
        }

        if (count($value) > self::THEME_LIBRARY_MAX_RECORDS) {
            self::addThemeWriteError($errors, $path, 'Theme library cannot contain more than 50 records.');
        }

        $seenIds = [];
        foreach ($value as $index => $record) {
            $recordPath = "{$path}.{$index}";
            if (! is_array($record)) {
                self::addThemeWriteError($errors, $recordPath, 'Theme library records must be objects.');

                continue;
            }

            foreach ($record as $key => $recordValue) {
                $fieldPath = "{$recordPath}.{$key}";
                if (! is_string($key) || ! isset(self::THEME_LIBRARY_RECORD_KEYS[$key])) {
                    self::addThemeWriteError($errors, $fieldPath, 'Unknown named theme key.');

                    continue;
                }

                switch ($key) {
                    case 'id':
                        $id = is_string($recordValue) ? self::normalizeThemeId($recordValue) : null;
                        if ($id === null) {
                            self::addThemeWriteError($errors, $fieldPath, 'Named theme ID is invalid.');
                        } elseif (isset($seenIds[$id])) {
                            self::addThemeWriteError($errors, $fieldPath, 'Named theme IDs must be unique.');
                        } else {
                            $seenIds[$id] = true;
                        }
                        break;
                    case 'name':
                        if (! is_string($recordValue) || trim($recordValue) === '' || strlen(trim($recordValue)) > 80) {
                            self::addThemeWriteError($errors, $fieldPath, 'Named theme name must be 1 to 80 characters.');
                        }
                        break;
                    case 'base_theme':
                        self::validateThemeEnum($recordValue, self::THEME_VALUES, $fieldPath, 'Named theme base preset is invalid.', $errors);
                        break;
                    case 'tokens':
                        self::validateThemeCustomizationForWrite($recordValue, $fieldPath, $errors);
                        break;
                    case 'area_tokens':
                        self::validateThemeAreaTokensForWrite($recordValue, $fieldPath, $errors);
                        break;
                    case 'motion':
                        self::validateThemeEnum($recordValue, self::THEME_MOTION_VALUES, $fieldPath, 'Named theme motion is invalid.', $errors);
                        break;
                    case 'motion_v6':
                        $errors = array_replace_recursive(
                            $errors,
                            TalosThemeMotionV6::validationErrors($recordValue, $fieldPath),
                        );
                        break;
                    case 'ui_animation_profile':
                        self::validateThemeEnum($recordValue, self::UI_ANIMATION_PROFILE_VALUES, $fieldPath, 'Named theme UI animation profile is invalid.', $errors);
                        break;
                    case 'ui_animation_customization':
                        self::validateUiAnimationCustomizationForWrite($recordValue, $fieldPath, $errors);
                        break;
                    case 'chat_layout':
                        self::validateChatLayoutForWrite($recordValue, $fieldPath, $errors);
                        break;
                    case 'theme_mode':
                        self::validateThemeEnum($recordValue, self::THEME_MODE_VALUES, $fieldPath, 'Named theme mode is invalid.', $errors);
                        break;
                    case 'created_at':
                    case 'updated_at':
                        if (! self::isValidThemeTimestamp($recordValue)) {
                            self::addThemeWriteError($errors, $fieldPath, 'Named theme timestamps must be ISO-8601 strings of at most 64 characters.');
                        }
                        break;
                }
            }

            foreach (['id', 'name', 'base_theme', 'tokens'] as $requiredKey) {
                if (! array_key_exists($requiredKey, $record)) {
                    self::addThemeWriteError($errors, "{$recordPath}.{$requiredKey}", "Named theme {$requiredKey} is required.");
                }
            }
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeAreaTokensForWrite(mixed $value, string $path, array &$errors): void
    {
        if (! is_array($value)) {
            self::addThemeWriteError($errors, $path, 'Theme area tokens must be an object.');

            return;
        }

        foreach ($value as $area => $tokens) {
            $areaPath = "{$path}.{$area}";
            if (! is_string($area) || ! isset(self::THEME_AREAS[$area])) {
                self::addThemeWriteError($errors, $areaPath, 'Unknown theme area.');

                continue;
            }
            if (! is_array($tokens)) {
                self::addThemeWriteError($errors, $areaPath, 'Theme area tokens must be an object.');

                continue;
            }

            foreach ($tokens as $key => $tokenValue) {
                $tokenPath = "{$areaPath}.{$key}";
                if (! is_string($key) || ! isset(self::THEME_AREA_COLOR_KEYS[$key])) {
                    self::addThemeWriteError($errors, $tokenPath, 'Unknown theme area token.');

                    continue;
                }
                self::validateThemeColor($tokenValue, $tokenPath, $errors);
            }
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateUiAnimationCustomizationForWrite(mixed $value, string $path, array &$errors): void
    {
        if (! is_array($value)) {
            self::addThemeWriteError($errors, $path, 'UI animation customization must be an object.');

            return;
        }

        $enumRules = [
            'open_close' => [self::UI_ANIMATION_OPEN_CLOSE_VALUES, 'UI animation open/close style is invalid.'],
            'surface_transition' => [self::UI_ANIMATION_SURFACE_TRANSITION_VALUES, 'UI animation surface transition is invalid.'],
            'feedback' => [self::UI_ANIMATION_FEEDBACK_VALUES, 'UI animation feedback style is invalid.'],
            'hover' => [self::UI_ANIMATION_HOVER_VALUES, 'UI animation hover style is invalid.'],
            'easing' => [self::UI_ANIMATION_EASING_VALUES, 'UI animation easing is invalid.'],
        ];
        $numberRules = [
            'duration_scale' => [50, 150, 'UI animation duration scale must be between 50 and 150.'],
            'intensity' => [0, 100, 'UI animation intensity must be between 0 and 100.'],
            'stagger' => [0, 120, 'UI animation stagger must be between 0 and 120.'],
        ];

        foreach ($value as $key => $animationValue) {
            $animationPath = "{$path}.{$key}";
            if (! is_string($key) || (! isset($enumRules[$key]) && ! isset($numberRules[$key]))) {
                self::addThemeWriteError($errors, $animationPath, 'Unknown UI animation customization key.');

                continue;
            }

            if (isset($enumRules[$key])) {
                self::validateThemeEnum($animationValue, $enumRules[$key][0], $animationPath, $enumRules[$key][1], $errors);

                continue;
            }

            self::validateThemeNumber($animationValue, $numberRules[$key][0], $numberRules[$key][1], $animationPath, $numberRules[$key][2], $errors);
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateChatLayoutForWrite(mixed $value, string $path, array &$errors): void
    {
        if (! is_array($value)) {
            self::addThemeWriteError($errors, $path, 'Chat layout must be an object.');

            return;
        }

        foreach ($value as $key => $layoutValue) {
            $layoutPath = "{$path}.{$key}";
            if ($key === 'bubble_scale') {
                self::validateThemeEnum($layoutValue, self::CHAT_BUBBLE_SCALE_VALUES, $layoutPath, 'Chat bubble scale is invalid.', $errors);
            } elseif ($key === 'composer_mode') {
                self::validateThemeEnum($layoutValue, self::CHAT_COMPOSER_MODE_VALUES, $layoutPath, 'Chat composer mode is invalid.', $errors);
            } elseif ($key === 'message_style') {
                self::validateThemeEnum($layoutValue, self::CHAT_MESSAGE_STYLE_VALUES, $layoutPath, 'Chat message style must be sections or bubbles.', $errors);
            } elseif ($key === 'advanced_rail_expanded') {
                if (! is_bool($layoutValue)) {
                    self::addThemeWriteError($errors, $layoutPath, 'Advanced rail setting must be a boolean.');
                }
            } elseif ($key === 'mobile_window_presentation') {
                self::validateThemeEnum(
                    $layoutValue,
                    self::CHAT_MOBILE_WINDOW_PRESENTATION_VALUES,
                    $layoutPath,
                    'Mobile tool window presentation must be drawer or fullscreen.',
                    $errors,
                );
            } else {
                self::addThemeWriteError($errors, $layoutPath, 'Unknown chat layout key.');
            }
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeColor(mixed $value, string $path, array &$errors): void
    {
        if (! is_string($value) || preg_match('/^#[0-9a-f]{6}$/i', trim($value)) !== 1) {
            self::addThemeWriteError($errors, $path, 'Theme colors must be six-digit hexadecimal values.');
        }
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateThemeNumber(mixed $value, int $min, int $max, string $path, string $message, array &$errors): void
    {
        $integer = self::parseThemeInteger($value);
        if ($integer === null || $integer < $min || $integer > $max) {
            self::addThemeWriteError($errors, $path, $message);
        }
    }

    /**
     * @param  array<string, mixed>  $preferences
     * @param  array<string, array<int, string>>  $errors
     */
    private static function validateActiveCustomThemeIdForWrite(array $preferences, mixed $storedPreferences, array &$errors): void
    {
        $stored = self::sanitizePreferences($storedPreferences);
        $activeValue = array_key_exists('active_custom_theme_id', $preferences)
            ? $preferences['active_custom_theme_id']
            : ($stored['active_custom_theme_id'] ?? null);
        if ($activeValue === null) {
            return;
        }

        $activeId = is_string($activeValue)
            ? self::normalizeThemeId($activeValue)
            : null;
        if ($activeId === null) {
            return;
        }

        $effectiveLibrary = array_key_exists('theme_library', $preferences)
            ? $preferences['theme_library']
            : ($stored['theme_library'] ?? []);
        $library = self::sanitizeThemeLibrary($effectiveLibrary);
        foreach ($library as $theme) {
            if (($theme['id'] ?? null) === $activeId) {
                return;
            }
        }

        self::addThemeWriteError(
            $errors,
            'preferences.active_custom_theme_id',
            'Active custom theme ID must reference the effective theme library.',
        );
    }

    private static function isValidThemeTimestamp(mixed $value): bool
    {
        if (! is_string($value)
            || $value === ''
            || strlen($value) > self::THEME_TIMESTAMP_MAX_LENGTH
            || preg_match(
                '~\A(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d):(?<second>[0-5]\d)(?:\.(?<fraction>\d{1,6}))?(?<timezone>Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)\z~',
                $value,
                $matches,
            ) !== 1
        ) {
            return false;
        }

        if (! checkdate((int) $matches['month'], (int) $matches['day'], (int) $matches['year'])) {
            return false;
        }

        try {
            $parsed = new \DateTimeImmutable($value);
        } catch (\Exception) {
            return false;
        }

        $dateTime = "{$matches['year']}-{$matches['month']}-{$matches['day']}T{$matches['hour']}:{$matches['minute']}:{$matches['second']}";
        $expectedOffset = in_array($matches['timezone'], ['Z', '+00:00', '-00:00'], true)
            ? '+00:00'
            : $matches['timezone'];

        return $parsed->format('Y-m-d\TH:i:s') === $dateTime
            && $parsed->format('P') === $expectedOffset;
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    private static function addThemeWriteError(array &$errors, string $path, string $message): void
    {
        $errors[$path] ??= [];
        $errors[$path][] = $message;
    }

    private static function isThemePreferenceKeyCandidate(string $key): bool
    {
        return str_starts_with($key, 'theme')
            || str_starts_with($key, 'ui_animation_')
            || str_starts_with($key, 'active_custom_theme')
            || str_starts_with($key, 'workspace_default_theme');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'revision' => 'integer',
            'preferences' => 'array',
        ];
    }

    private static function isSecretPreferenceKey(string $key): bool
    {
        $normalized = strtolower((string) preg_replace('/([a-z])([A-Z])/', '$1_$2', $key));
        $segments = preg_split('/[^a-z0-9]+/', $normalized) ?: [];

        return str_contains($normalized, 'api_key')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
            || in_array('key', $segments, true)
            || in_array('credential', $segments, true)
            || in_array('credentials', $segments, true)
            || in_array('authorization', $segments, true)
            || in_array('bearer', $segments, true)
            || in_array('oauth', $segments, true)
            || str_ends_with($normalized, 'token')
            || str_ends_with($normalized, '_token')
            || str_ends_with($normalized, '-token');
    }

    /**
     * @return array{order?: array<int, string>, collapsed_groups?: array<int, string>, collapsed?: bool}|null
     */
    private static function sanitizeSidebarRail(mixed $value): ?array
    {
        return self::sanitizeSidebarRailValue($value, false);
    }

    /**
     * @param  array<string, mixed>  $safe
     * @return array<string, mixed>
     */
    private static function applyRawSidebarRailShape(array $safe, mixed $rawPreferencesJson): array
    {
        if (! is_string($rawPreferencesJson) || $rawPreferencesJson === '') {
            return $safe;
        }

        try {
            $rawPreferences = json_decode($rawPreferencesJson, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return $safe;
        }

        if (! $rawPreferences instanceof stdClass
            || $rawPreferences::class !== stdClass::class
            || ! property_exists($rawPreferences, 'sidebar_rail')
        ) {
            return $safe;
        }

        $rail = self::sanitizeSidebarRailValue($rawPreferences->sidebar_rail, true);
        if ($rail === null) {
            unset($safe['sidebar_rail']);
        } else {
            $safe['sidebar_rail'] = $rail;
        }

        return $safe;
    }

    /**
     * @param  array<string, mixed>  $safe
     * @return array<string, mixed>
     */
    private static function applyRawOnboardingShape(array $safe, mixed $rawPreferencesJson): array
    {
        if (! is_string($rawPreferencesJson) || $rawPreferencesJson === '') {
            return $safe;
        }

        try {
            $rawPreferences = json_decode($rawPreferencesJson, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return $safe;
        }

        if (! $rawPreferences instanceof stdClass
            || $rawPreferences::class !== stdClass::class
            || ! property_exists($rawPreferences, 'onboarding')
        ) {
            return $safe;
        }

        $onboarding = self::sanitizeOnboardingValue($rawPreferences->onboarding, true);
        if ($onboarding === null) {
            unset($safe['onboarding']);
        } else {
            $safe['onboarding'] = $onboarding;
        }

        return $safe;
    }

    /**
     * @return array{order?: array<int, string>, collapsed_groups?: array<int, string>, collapsed?: bool}|null
     */
    private static function sanitizeSidebarRailValue(mixed $value, bool $rawJson): ?array
    {
        if ($rawJson) {
            if (! $value instanceof stdClass || $value::class !== stdClass::class) {
                return null;
            }

            $value = get_object_vars($value);
        } elseif (! is_array($value) || array_is_list($value)) {
            return null;
        }

        $safe = [];
        $order = $value['order'] ?? null;
        if (is_array($order) && array_is_list($order)) {
            $safeOrder = [];
            $seen = [];
            foreach ($order as $itemId) {
                if (! is_string($itemId)
                    || ! isset(self::SIDEBAR_RAIL_ITEM_VALUES[$itemId])
                    || isset($seen[$itemId])
                ) {
                    continue;
                }

                $safeOrder[] = $itemId;
                $seen[$itemId] = true;
                if (count($safeOrder) === count(self::SIDEBAR_RAIL_ITEM_VALUES)) {
                    break;
                }
            }
            $safe['order'] = $safeOrder;
        }

        $groups = $value['collapsed_groups'] ?? null;
        if (is_array($groups) && array_is_list($groups)) {
            $safeGroups = [];
            $seen = [];
            foreach ($groups as $groupId) {
                if (! is_string($groupId)
                    || ! isset(self::SIDEBAR_RAIL_GROUP_VALUES[$groupId])
                    || isset($seen[$groupId])
                ) {
                    continue;
                }

                $safeGroups[] = $groupId;
                $seen[$groupId] = true;
                if (count($safeGroups) === count(self::SIDEBAR_RAIL_GROUP_VALUES)) {
                    break;
                }
            }
            $safe['collapsed_groups'] = $safeGroups;
        }

        if (isset($value['collapsed']) && is_bool($value['collapsed'])) {
            $safe['collapsed'] = $value['collapsed'];
        }

        return $safe === [] ? null : $safe;
    }

    /**
     * @return array{intro_version: int, intro_outcome: string}|null
     */
    private static function sanitizeOnboardingValue(mixed $value, bool $rawJson): ?array
    {
        if ($rawJson) {
            if (! $value instanceof stdClass || $value::class !== stdClass::class) {
                return null;
            }

            $value = get_object_vars($value);
        } elseif (! is_array($value) || array_is_list($value)) {
            return null;
        }

        if (count($value) !== count(self::ONBOARDING_KEYS)
            || array_diff_key($value, self::ONBOARDING_KEYS) !== []
            || ! array_key_exists('intro_version', $value)
            || ! array_key_exists('intro_outcome', $value)
            || ! is_int($value['intro_version'])
            || $value['intro_version'] < 1
            || $value['intro_version'] > 65535
            || ! is_string($value['intro_outcome'])
            || ! isset(self::ONBOARDING_OUTCOME_VALUES[$value['intro_outcome']])
        ) {
            return null;
        }

        return [
            'intro_version' => $value['intro_version'],
            'intro_outcome' => $value['intro_outcome'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function sanitizeThemeCustomization(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        foreach ($value as $key => $tokenValue) {
            if (! is_string($key)
                || ! isset(self::THEME_CUSTOMIZATION_KEYS[$key])
                || self::isSecretPreferenceKey($key)
                || self::isUnsafeThemeKey($key)
            ) {
                continue;
            }

            if (isset(self::THEME_COLOR_KEYS[$key]) || in_array($key, ['scrollbar_track', 'scrollbar_thumb', 'scrollbar_thumb_hover'], true)) {
                $color = self::normalizeThemeColor($tokenValue);
                if ($color !== null) {
                    $safe[$key] = $color;
                }

                continue;
            }

            if ($key === 'font') {
                if (is_string($tokenValue) && isset([
                    'inter' => true,
                    'manrope' => true,
                    'mono' => true,
                    'system' => true,
                    'display' => true,
                    'serif' => true,
                ][$tokenValue])) {
                    $safe[$key] = $tokenValue;
                }

                continue;
            }

            if ($key === 'density') {
                if (is_string($tokenValue) && isset([
                    'compact' => true,
                    'comfortable' => true,
                    'spacious' => true,
                ][$tokenValue])) {
                    $safe[$key] = $tokenValue;
                }

                continue;
            }

            if ($key === 'radius') {
                if (is_string($tokenValue) && isset([
                    'sharp' => true,
                    'balanced' => true,
                    'soft' => true,
                ][$tokenValue])) {
                    $safe[$key] = $tokenValue;
                }

                continue;
            }

            if ($key === 'effect') {
                if (is_string($tokenValue) && isset([
                    'dag-flow' => true,
                    'kahn-grid' => true,
                    'trace-rain' => true,
                    'signal-mesh' => true,
                    'none' => true,
                ][$tokenValue])) {
                    $safe[$key] = $tokenValue;
                }

                continue;
            }

            if ($key === 'effect_intensity') {
                $intensity = self::boundedInteger($tokenValue, 0, 100);
                if ($intensity !== null) {
                    $safe[$key] = $intensity;
                }

                continue;
            }

            if ($key === 'scrollbar_width') {
                $width = self::boundedInteger($tokenValue, 6, 18);
                if ($width !== null) {
                    $safe[$key] = $width;
                }

                continue;
            }

            $safe[$key] = $tokenValue;
        }

        return $safe;
    }

    /**
     * @return array<string, array<string, bool>>
     */
    private static function sanitizeAppearanceVisibility(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        foreach ($value as $group => $settings) {
            if (! is_string($group) || ! isset(self::APPEARANCE_VISIBILITY_GROUPS[$group]) || ! is_array($settings)) {
                continue;
            }

            $safeGroup = [];
            foreach ($settings as $key => $enabled) {
                if (! is_string($key)
                    || ! isset(self::APPEARANCE_VISIBILITY_GROUPS[$group][$key])
                    || self::isSecretPreferenceKey($key)
                    || self::isUnsafeThemeKey($key)
                    || ! is_bool($enabled)
                ) {
                    continue;
                }

                $safeGroup[$key] = $enabled;
            }

            if ($safeGroup !== []) {
                $safe[$group] = $safeGroup;
            }
        }

        return $safe;
    }

    /**
     * @return array<string, string>
     */
    private static function sanitizeKeyboardShortcuts(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        $usedBindings = [];

        foreach ($value as $action => $binding) {
            if (! is_string($action)
                || ! isset(self::KEYBOARD_SHORTCUT_ACTIONS[$action])
                || self::isSecretPreferenceKey($action)
                || (! is_string($binding) && $binding !== null)
            ) {
                continue;
            }

            $normalized = $binding === null ? '' : self::normalizeKeyboardShortcut($binding);
            if ($normalized === null) {
                continue;
            }

            if ($normalized !== '') {
                $bindingKey = strtolower($normalized);
                if (isset($usedBindings[$bindingKey])) {
                    continue;
                }

                $usedBindings[$bindingKey] = true;
            }

            $safe[$action] = $normalized;
        }

        return $safe;
    }

    /**
     * @return array<string, bool|string>
     */
    private static function sanitizeChatLayout(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        $bubbleScale = $value['bubble_scale'] ?? null;
        if (is_string($bubbleScale) && isset(self::CHAT_BUBBLE_SCALE_VALUES[$bubbleScale])) {
            $safe['bubble_scale'] = $bubbleScale;
        }

        $composerMode = $value['composer_mode'] ?? null;
        if (is_string($composerMode) && isset(self::CHAT_COMPOSER_MODE_VALUES[$composerMode])) {
            $safe['composer_mode'] = $composerMode;
        }

        $messageStyle = $value['message_style'] ?? null;
        if (is_string($messageStyle) && isset(self::CHAT_MESSAGE_STYLE_VALUES[$messageStyle])) {
            $safe['message_style'] = $messageStyle;
        }

        if (isset($value['advanced_rail_expanded']) && is_bool($value['advanced_rail_expanded'])) {
            $safe['advanced_rail_expanded'] = $value['advanced_rail_expanded'];
        }

        $mobileWindowPresentation = $value['mobile_window_presentation'] ?? null;
        if (is_string($mobileWindowPresentation) && isset(self::CHAT_MOBILE_WINDOW_PRESENTATION_VALUES[$mobileWindowPresentation])) {
            $safe['mobile_window_presentation'] = $mobileWindowPresentation;
        }

        return $safe;
    }

    private static function normalizeKeyboardShortcut(string $binding): ?string
    {
        $trimmed = trim($binding);
        if ($trimmed === '') {
            return '';
        }

        if (strlen($trimmed) > 48 || preg_match('/[<>{};]/', $trimmed) === 1) {
            return null;
        }

        $parts = preg_split('/\s*\+\s*/', $trimmed);
        if (! is_array($parts) || count($parts) < 1 || count($parts) > 4) {
            return null;
        }

        $modifiers = [];
        $key = null;
        foreach ($parts as $part) {
            $token = trim($part);
            if ($token === '') {
                return null;
            }

            $lower = strtolower($token);
            $modifier = match ($lower) {
                'ctrl', 'control' => 'Ctrl',
                'alt', 'option' => 'Alt',
                'shift' => 'Shift',
                'meta', 'cmd', 'command' => 'Meta',
                default => null,
            };

            if ($modifier !== null) {
                $modifiers[$modifier] = true;

                continue;
            }

            if ($key !== null || preg_match('~^[A-Za-z0-9,./`\\[\\]\\\\-]$~', $token) !== 1 && ! in_array($token, ['Esc', 'Escape', 'Enter', 'Tab', 'Space'], true)) {
                return null;
            }

            $key = match ($token) {
                'Escape' => 'Esc',
                ' ' => 'Space',
                default => strlen($token) === 1 ? strtoupper($token) : $token,
            };
        }

        if ($key === null) {
            return null;
        }

        $ordered = [];
        foreach (['Ctrl', 'Alt', 'Shift', 'Meta'] as $modifier) {
            if (isset($modifiers[$modifier])) {
                $ordered[] = $modifier;
            }
        }

        $ordered[] = $key;

        return implode('+', $ordered);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function sanitizeThemeLibrary(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            return [];
        }

        $safe = [];
        $seenIds = [];
        foreach ($value as $record) {
            if (count($safe) >= self::THEME_LIBRARY_MAX_RECORDS) {
                break;
            }

            if (is_array($record) && array_key_exists('base_theme', $record)) {
                $theme = self::normalizeThemeValue($record['base_theme']);
                if ($theme !== null) {
                    $record['base_theme'] = $theme;
                }
            }

            $recordErrors = [];
            self::validateThemeLibraryForWrite([$record], 'theme_library', $recordErrors);
            if ($recordErrors !== [] || ! is_array($record)) {
                continue;
            }

            $safeRecord = [];
            foreach ($record as $key => $recordValue) {
                if (! is_string($key)
                    || ! isset(self::THEME_LIBRARY_RECORD_KEYS[$key])
                    || self::isSecretPreferenceKey($key)
                    || self::isUnsafeThemeKey($key)
                ) {
                    continue;
                }

                if ($key === 'tokens') {
                    $safeRecord[$key] = self::sanitizeThemeCustomization($recordValue);

                    continue;
                }

                if ($key === 'area_tokens') {
                    $areaTokens = self::sanitizeThemeAreaTokens($recordValue);
                    if ($areaTokens !== []) {
                        $safeRecord[$key] = $areaTokens;
                    }

                    continue;
                }

                if ($key === 'motion') {
                    if (is_string($recordValue) && isset(self::THEME_MOTION_VALUES[$recordValue])) {
                        $safeRecord[$key] = $recordValue;
                    }

                    continue;
                }

                if ($key === 'motion_v6') {
                    $motion = TalosThemeMotionV6::parse($recordValue);
                    if ($motion['success']) {
                        $safeRecord[$key] = $motion['value'];
                    }

                    continue;
                }

                if ($key === 'theme_mode') {
                    if (is_string($recordValue) && isset(self::THEME_MODE_VALUES[$recordValue])) {
                        $safeRecord[$key] = $recordValue;
                    }

                    continue;
                }

                if ($key === 'ui_animation_profile') {
                    if (is_string($recordValue) && isset(self::UI_ANIMATION_PROFILE_VALUES[$recordValue])) {
                        $safeRecord[$key] = $recordValue;
                    }

                    continue;
                }

                if ($key === 'ui_animation_customization') {
                    $animation = self::sanitizeUiAnimationCustomization($recordValue);
                    if ($animation !== []) {
                        $safeRecord[$key] = $animation;
                    }

                    continue;
                }

                if ($key === 'chat_layout') {
                    $layout = self::sanitizeChatLayout($recordValue);
                    if ($layout !== []) {
                        $safeRecord[$key] = $layout;
                    }

                    continue;
                }

                if ($key === 'id') {
                    $id = is_string($recordValue) ? self::normalizeThemeId($recordValue) : null;
                    if ($id !== null) {
                        $safeRecord[$key] = $id;
                    }

                    continue;
                }

                if ($key === 'name') {
                    if (is_string($recordValue) && trim($recordValue) !== '') {
                        $safeRecord[$key] = substr(trim($recordValue), 0, 80);
                    }

                    continue;
                }

                if ($key === 'base_theme') {
                    $theme = self::normalizeThemeValue($recordValue);
                    if ($theme !== null) {
                        $safeRecord[$key] = $theme;
                    }

                    continue;
                }

                if (in_array($key, ['created_at', 'updated_at'], true)) {
                    if (self::isValidThemeTimestamp($recordValue)) {
                        $safeRecord[$key] = $recordValue;
                    }

                    continue;
                }

                if (is_array($recordValue)) {
                    continue;
                }
            }

            $id = $safeRecord['id'] ?? null;
            if (! is_string($id) || isset($seenIds[$id])) {
                continue;
            }

            $seenIds[$id] = true;
            $safe[] = $safeRecord;
        }

        return $safe;
    }

    private static function normalizeThemeValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        if (isset(self::THEME_VALUES[$value])) {
            return $value;
        }

        return self::LEGACY_THEME_VALUES[$value] ?? null;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function sanitizeThemeAreaTokens(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        foreach ($value as $area => $tokens) {
            if (! is_string($area) || ! isset(self::THEME_AREAS[$area]) || ! is_array($tokens)) {
                continue;
            }

            $safeTokens = [];
            foreach ($tokens as $key => $tokenValue) {
                if (! is_string($key)
                    || ! isset(self::THEME_AREA_COLOR_KEYS[$key])
                    || self::isSecretPreferenceKey($key)
                    || self::isUnsafeThemeKey($key)
                    || is_array($tokenValue)
                ) {
                    continue;
                }

                $color = self::normalizeThemeColor($tokenValue);
                if ($color !== null) {
                    $safeTokens[$key] = $color;
                }
            }

            if ($safeTokens !== []) {
                $safe[$area] = $safeTokens;
            }
        }

        return $safe;
    }

    /**
     * @return array<string, mixed>
     */
    private static function sanitizeUiAnimationCustomization(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];

        foreach ($value as $key => $animationValue) {
            if (! is_string($key)
                || self::isSecretPreferenceKey($key)
                || self::isUnsafeThemeKey($key)
                || is_array($animationValue)
            ) {
                continue;
            }

            if ($key === 'open_close') {
                if (is_string($animationValue) && isset(self::UI_ANIMATION_OPEN_CLOSE_VALUES[$animationValue])) {
                    $safe[$key] = $animationValue;
                }

                continue;
            }

            if ($key === 'surface_transition') {
                if (is_string($animationValue) && isset(self::UI_ANIMATION_SURFACE_TRANSITION_VALUES[$animationValue])) {
                    $safe[$key] = $animationValue;
                }

                continue;
            }

            if ($key === 'feedback') {
                if (is_string($animationValue) && isset(self::UI_ANIMATION_FEEDBACK_VALUES[$animationValue])) {
                    $safe[$key] = $animationValue;
                }

                continue;
            }

            if ($key === 'hover') {
                if (is_string($animationValue) && isset(self::UI_ANIMATION_HOVER_VALUES[$animationValue])) {
                    $safe[$key] = $animationValue;
                }

                continue;
            }

            if ($key === 'easing') {
                if (is_string($animationValue) && isset(self::UI_ANIMATION_EASING_VALUES[$animationValue])) {
                    $safe[$key] = $animationValue;
                }

                continue;
            }

            if ($key === 'duration_scale') {
                $durationScale = self::boundedInteger($animationValue, 50, 150);
                if ($durationScale !== null) {
                    $safe[$key] = $durationScale;
                }

                continue;
            }

            if ($key === 'intensity') {
                $intensity = self::boundedInteger($animationValue, 0, 100);
                if ($intensity !== null) {
                    $safe[$key] = $intensity;
                }

                continue;
            }

            if ($key === 'stagger') {
                $stagger = self::boundedInteger($animationValue, 0, 120);
                if ($stagger !== null) {
                    $safe[$key] = $stagger;
                }
            }
        }

        return $safe;
    }

    private static function parseThemeInteger(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = trim($value);
        if (preg_match('/^[+-]?\d+$/', $normalized) !== 1) {
            return null;
        }

        return (int) $normalized;
    }

    private static function boundedInteger(mixed $value, int $min, int $max): ?int
    {
        $integer = self::parseThemeInteger($value);
        if ($integer === null || $integer < $min || $integer > $max) {
            return null;
        }

        return $integer;
    }

    private static function normalizeThemeColor(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim($value));

        return preg_match('/^#[0-9a-f]{6}$/', $normalized) === 1 ? $normalized : null;
    }

    private static function normalizeThemeId(string $value): ?string
    {
        $normalized = strtolower(trim($value));
        $normalized = (string) preg_replace('/[^a-z0-9_-]+/', '-', $normalized);
        $normalized = trim(substr($normalized, 0, 80), '-');

        return $normalized === '' ? null : $normalized;
    }

    private static function isUnsafeThemeKey(string $key): bool
    {
        $normalized = strtolower($key);

        return $normalized === 'style'
            || $normalized === 'script'
            || $normalized === 'css'
            || $normalized === 'url'
            || str_contains($normalized, 'style')
            || str_contains($normalized, 'script')
            || str_contains($normalized, 'css')
            || str_contains($normalized, 'url')
            || str_starts_with($normalized, 'on');
    }
}
