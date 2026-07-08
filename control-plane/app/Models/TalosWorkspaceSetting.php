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
    ];

    private const THEME_LIBRARY_RECORD_KEYS = [
        'id' => true,
        'name' => true,
        'base_theme' => true,
        'tokens' => true,
        'area_tokens' => true,
        'motion' => true,
    ];

    private const THEME_MOTION_VALUES = [
        'system' => true,
        'off' => true,
        'subtle' => true,
        'normal' => true,
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

            if ($key === 'theme_area_tokens') {
                $areaTokens = self::sanitizeThemeAreaTokens($value);
                if ($areaTokens !== []) {
                    $safe[$key] = $areaTokens;
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
        $normalized = strtolower($key);

        return str_contains($normalized, 'api_key')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
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

            $safe[$key] = $tokenValue;
        }

        return $safe;
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
