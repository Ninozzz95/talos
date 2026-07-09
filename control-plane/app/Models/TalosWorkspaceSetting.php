<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class TalosWorkspaceSetting extends Model
{
    public const DEFAULT_ID = 'default';

    private const THEME_COLOR_KEYS = [
        'background' => true,
        'panel' => true,
        'text' => true,
        'accent' => true,
        'secondary' => true,
        'border' => true,
    ];

    private const THEME_VALUES = [
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
        'ui_animation_profile' => true,
        'ui_animation_customization' => true,
    ];

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
        'chat' => true,
        'dashboard' => true,
        'sidebar' => true,
        'header' => true,
        'composer' => true,
        'window' => true,
        'button' => true,
        'code' => true,
        'workspace' => true,
        'panel' => true,
        'card' => true,
        'settings' => true,
        'benchmark' => true,
        'trace' => true,
        'replay' => true,
    ];

    private const APPEARANCE_VISIBILITY_GROUPS = [
        'chat_area' => [
            'session_header' => true,
            'full_width_chat' => true,
            'welcome_message' => true,
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

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'default_model_profile_id',
        'default_context_set_id',
        'preferences',
    ];

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'default_model_profile_id' => $this->default_model_profile_id,
            'default_context_set_id' => $this->default_context_set_id,
            'preferences' => self::sanitizePreferences($this->preferences ?? []),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /**
     * @param mixed $preferences
     * @return array<mixed>
     */
    public static function sanitizePreferences(mixed $preferences): array
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
                if (is_string($value) && isset(self::THEME_VALUES[$value])) {
                    $safe[$key] = $value;
                }

                continue;
            }

            if ($key === 'theme_customization') {
                $customization = self::sanitizeThemeCustomization($value);
                if ($customization !== []) {
                    $safe[$key] = $customization;
                }

                continue;
            }

            if ($key === 'theme_library') {
                $library = self::sanitizeThemeLibrary($value);
                if ($library !== []) {
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

            if ($key === 'theme_mode') {
                if (is_string($value) && isset(self::THEME_MODE_VALUES[$value])) {
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
                if ($customization !== []) {
                    $safe[$key] = $customization;
                }

                continue;
            }

            if ($key === 'theme_area_tokens') {
                $areaTokens = self::sanitizeThemeAreaTokens($value);
                if ($areaTokens !== []) {
                    $safe[$key] = $areaTokens;
                }

                continue;
            }

            if ($key === 'appearance_visibility') {
                $visibility = self::sanitizeAppearanceVisibility($value);
                if ($visibility !== []) {
                    $safe[$key] = $visibility;
                }

                continue;
            }

            if ($key === 'keyboard_shortcuts') {
                $shortcuts = self::sanitizeKeyboardShortcuts($value);
                if ($shortcuts !== []) {
                    $safe[$key] = $shortcuts;
                }

                continue;
            }

            $safe[$key] = is_array($value) ? self::sanitizePreferences($value) : $value;
        }

        return $safe;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
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
     * @param mixed $value
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

            if (is_array($tokenValue)) {
                continue;
            }

            if ($key === 'scrollbar_width') {
                $width = self::clampInteger($tokenValue, 6, 18);
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
     * @param mixed $value
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
     * @param mixed $value
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
     * @param mixed $value
     * @return array<int, array<string, mixed>>
     */
    private static function sanitizeThemeLibrary(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $safe = [];
        foreach ($value as $record) {
            if (! is_array($record)) {
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
                    $tokens = self::sanitizeThemeCustomization($recordValue);
                    if ($tokens !== []) {
                        $safeRecord[$key] = $tokens;
                    }

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

                if (is_array($recordValue)) {
                    continue;
                }

                $safeRecord[$key] = $recordValue;
            }

            if ($safeRecord !== []) {
                $safe[] = $safeRecord;
            }
        }

        return $safe;
    }

    /**
     * @param mixed $value
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
                    || ! isset(self::THEME_COLOR_KEYS[$key])
                    || self::isSecretPreferenceKey($key)
                    || self::isUnsafeThemeKey($key)
                    || is_array($tokenValue)
                ) {
                    continue;
                }

                $safeTokens[$key] = $tokenValue;
            }

            if ($safeTokens !== []) {
                $safe[$area] = $safeTokens;
            }
        }

        return $safe;
    }

    /**
     * @param mixed $value
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
                $durationScale = self::clampInteger($animationValue, 50, 150);
                if ($durationScale !== null) {
                    $safe[$key] = $durationScale;
                }

                continue;
            }

            if ($key === 'intensity') {
                $intensity = self::clampInteger($animationValue, 0, 100);
                if ($intensity !== null) {
                    $safe[$key] = $intensity;
                }

                continue;
            }

            if ($key === 'stagger') {
                $stagger = self::clampInteger($animationValue, 0, 120);
                if ($stagger !== null) {
                    $safe[$key] = $stagger;
                }
            }
        }

        return $safe;
    }

    private static function clampInteger(mixed $value, int $min, int $max): ?int
    {
        if (! is_int($value) && ! is_float($value) && ! is_string($value)) {
            return null;
        }

        if (is_string($value) && trim($value) === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        $numeric = (int) round((float) $value);

        return min($max, max($min, $numeric));
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
