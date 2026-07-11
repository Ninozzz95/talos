<?php

declare(strict_types=1);

namespace App\Support;

final class TalosThemeContrast
{
    private const MINIMUM_NORMAL_TEXT_RATIO = 4.5;

    /** @var array<string, array{background: string, accent: string, secondary: string, line: string, light: bool}> */
    private const PRESETS = [
        'forge' => ['background' => '#080b11', 'accent' => '#c98b32', 'secondary' => '#6ad4d4', 'line' => '#27313e', 'light' => false],
        'paper' => ['background' => '#f8fafc', 'accent' => '#a96617', 'secondary' => '#2f6f7d', 'line' => '#d7dee8', 'light' => true],
        'terminal' => ['background' => '#020403', 'accent' => '#63f08e', 'secondary' => '#d6ff72', 'line' => '#163821', 'light' => false],
        'aurora' => ['background' => '#071113', 'accent' => '#42e7c7', 'secondary' => '#ff6bb5', 'line' => '#233742', 'light' => false],
        'glacier' => ['background' => '#f4f9fb', 'accent' => '#2367d1', 'secondary' => '#ef7d30', 'line' => '#c9d7e3', 'light' => true],
        'ember' => ['background' => '#10090a', 'accent' => '#ff5c62', 'secondary' => '#ffbd5c', 'line' => '#3b2224', 'light' => false],
        'atlas' => ['background' => '#07101f', 'accent' => '#d49a52', 'secondary' => '#57d49c', 'line' => '#243146', 'light' => false],
        'noir' => ['background' => '#050505', 'accent' => '#f2f2f2', 'secondary' => '#ff405a', 'line' => '#333333', 'light' => false],
        'signal' => ['background' => '#091011', 'accent' => '#ff6f61', 'secondary' => '#b4f06f', 'line' => '#213236', 'light' => false],
        'violet' => ['background' => '#0d0a19', 'accent' => '#b794f6', 'secondary' => '#6ee7b7', 'line' => '#2f2848', 'light' => false],
        'claudius' => ['background' => '#faf9f5', 'accent' => '#d97757', 'secondary' => '#6a9bcc', 'line' => '#e8e6dc', 'light' => true],
        'basicus' => ['background' => '#fafafa', 'accent' => '#1976d2', 'secondary' => '#9c27b0', 'line' => '#e0e0e0', 'light' => true],
    ];

    /** @var array<string, array{background: string, surface: string, text: string, muted: string}> */
    private const AREA_STYLE_KEYS = [
        'sidebar' => ['background' => 'sidebar', 'surface' => 'panel_soft', 'text' => 'text', 'muted' => 'muted'],
        'chat' => ['background' => 'chat_background', 'surface' => 'panel', 'text' => 'text', 'muted' => 'muted'],
        'composer' => ['background' => 'composer_background', 'surface' => 'composer_surface', 'text' => 'composer_text', 'muted' => 'muted'],
        'window' => ['background' => 'window_background', 'surface' => 'card', 'text' => 'text', 'muted' => 'muted'],
        'header' => ['background' => 'header', 'surface' => 'panel', 'text' => 'text', 'muted' => 'muted'],
        'button' => ['background' => 'secondary_surface', 'surface' => 'active', 'text' => 'text', 'muted' => 'muted'],
        'card' => ['background' => 'card', 'surface' => 'panel', 'text' => 'text', 'muted' => 'muted'],
        'code' => ['background' => 'code_background', 'surface' => 'code_surface', 'text' => 'code_text', 'muted' => 'muted'],
    ];

    /**
     * @param array<string, mixed> $preferences
     * @return array<string, array<int, string>>
     */
    public static function validatePreferences(array $preferences): array
    {
        $errors = [];
        $baseTheme = self::themeId($preferences['theme'] ?? null);
        self::validateThemeState(
            $baseTheme,
            self::record($preferences['theme_customization'] ?? null),
            self::record($preferences['theme_area_tokens'] ?? null),
            'preferences.theme_customization',
            'preferences.theme_area_tokens',
            $errors,
        );

        $library = $preferences['theme_library'] ?? null;
        if (is_array($library) && array_is_list($library)) {
            foreach ($library as $index => $theme) {
                if (! is_array($theme)) {
                    continue;
                }

                self::validateThemeState(
                    self::themeId($theme['base_theme'] ?? null),
                    self::record($theme['tokens'] ?? null),
                    self::record($theme['area_tokens'] ?? null),
                    "preferences.theme_library.{$index}.tokens",
                    "preferences.theme_library.{$index}.area_tokens",
                    $errors,
                );
            }
        }

        return $errors;
    }

    /**
     * @param array<string, mixed> $customization
     * @param array<string, mixed> $areaTokens
     * @param array<string, array<int, string>> $errors
     */
    private static function validateThemeState(
        string $baseTheme,
        array $customization,
        array $areaTokens,
        string $customizationPath,
        string $areaPath,
        array &$errors,
    ): void {
        foreach (['light', 'dark'] as $mode) {
            $style = self::applyCustomization(self::baseStyle($baseTheme, $mode), $customization);

            if (! self::pairsAreReadable($style, [
                ['text', 'background'],
                ['text', 'panel'],
                ['muted', 'background'],
                ['muted', 'panel'],
            ])) {
                self::addError($errors, $customizationPath, "Theme normal text does not meet 4.5:1 contrast in {$mode} mode.");
            }

            foreach ($areaTokens as $area => $tokens) {
                if (! is_string($area) || ! isset(self::AREA_STYLE_KEYS[$area]) || ! is_array($tokens)) {
                    continue;
                }

                $keys = self::AREA_STYLE_KEYS[$area];
                $areaStyle = $style;
                foreach (['background', 'surface', 'text', 'muted'] as $token) {
                    $color = self::color($tokens[$token] ?? null);
                    if ($color !== null) {
                        $areaStyle[$keys[$token]] = $color;
                    }
                }

                if ($area === 'window' && isset($tokens['background'])) {
                    $windowBackground = self::color($tokens['background']);
                    if ($windowBackground !== null) {
                        $areaStyle['header'] = $windowBackground;
                    }
                }

                $pairs = [
                    [$keys['text'], $keys['background']],
                    [$keys['text'], $keys['surface']],
                    [$keys['muted'], $keys['background']],
                    [$keys['muted'], $keys['surface']],
                ];
                if ($area === 'window') {
                    $pairs[] = [$keys['text'], 'header'];
                    $pairs[] = [$keys['muted'], 'header'];
                }
                if ($area === 'button') {
                    foreach (['background', 'panel', 'card', 'header', 'sidebar'] as $transparentSurface) {
                        $pairs[] = [$keys['text'], $transparentSurface];
                        $pairs[] = [$keys['muted'], $transparentSurface];
                    }
                }

                if (! self::pairsAreReadable($areaStyle, $pairs)) {
                    self::addError(
                        $errors,
                        "{$areaPath}.{$area}",
                        "Theme area normal text does not meet 4.5:1 contrast in {$mode} mode.",
                    );
                }
            }

            if (! self::transparentButtonsAreReadable($style, $areaTokens)) {
                self::addError(
                    $errors,
                    "{$areaPath}.button",
                    "Transparent button text does not meet 4.5:1 contrast across customized areas in {$mode} mode.",
                );
            }
        }
    }

    /**
     * @param array<string, array{0: float, 1: float, 2: float}> $style
     * @param array<string, mixed> $areaTokens
     */
    private static function transparentButtonsAreReadable(array $style, array $areaTokens): bool
    {
        $buttonTokens = $areaTokens['button'] ?? null;
        if (! is_array($buttonTokens) || $buttonTokens === []) {
            return true;
        }

        $crossStyle = $style;
        $crossStyle['transparent_button_text'] = self::color($buttonTokens['text'] ?? null) ?? $style['text'];
        $crossStyle['transparent_button_muted'] = self::color($buttonTokens['muted'] ?? null) ?? $style['muted'];
        $pairs = [];

        foreach (['sidebar', 'chat', 'composer', 'window', 'header', 'card'] as $area) {
            $keys = self::AREA_STYLE_KEYS[$area];
            $tokens = isset($areaTokens[$area]) && is_array($areaTokens[$area])
                ? $areaTokens[$area]
                : [];

            foreach (['background', 'surface'] as $surface) {
                $styleKey = "transparent_button_{$area}_{$surface}";
                $crossStyle[$styleKey] = self::color($tokens[$surface] ?? null) ?? $style[$keys[$surface]];
                $pairs[] = ['transparent_button_text', $styleKey];
                $pairs[] = ['transparent_button_muted', $styleKey];
            }

            if ($area === 'window') {
                $styleKey = 'transparent_button_window_chrome';
                $crossStyle[$styleKey] = self::color($tokens['background'] ?? null) ?? $style['header'];
                $pairs[] = ['transparent_button_text', $styleKey];
                $pairs[] = ['transparent_button_muted', $styleKey];
            }
        }

        return self::pairsAreReadable($crossStyle, $pairs);
    }

    /**
     * @param array<string, array{0: float, 1: float, 2: float}> $style
     * @param array<string, mixed> $customization
     * @return array<string, array{0: float, 1: float, 2: float}>
     */
    private static function applyCustomization(array $style, array $customization): array
    {
        $background = self::color($customization['background'] ?? null);
        if ($background !== null) {
            $style['background'] = $background;
            $style['sidebar'] = $background;
            $style['header'] = self::mix($background, 88, self::rgb('#000000'));
        }

        $panel = self::color($customization['panel'] ?? null);
        if ($panel !== null) {
            $secondaryAccent = self::color($customization['accent'] ?? null) ?? self::rgb('#c98b32');
            $style['panel'] = $panel;
            $style['card'] = $panel;
            $style['panel_soft'] = self::mix(
                $panel,
                $background !== null ? 72 : 84,
                $background ?? self::rgb('#000000'),
            );
            $style['secondary_surface'] = self::mix($panel, 78, $secondaryAccent);
        }

        $text = self::color($customization['text'] ?? null);
        if ($text !== null) {
            $style['text'] = $text;
            $style['muted'] = self::mix($text, 68, $background ?? $style['background']);
        }

        return $style;
    }

    /**
     * @return array<string, array{0: float, 1: float, 2: float}>
     */
    private static function baseStyle(string $theme, string $mode): array
    {
        $preset = self::PRESETS[$theme];
        $accent = self::rgb($preset['accent']);
        $secondary = self::rgb($preset['secondary']);
        $background = self::rgb($preset['background']);

        if ($mode === 'light') {
            $background = $preset['light']
                ? $background
                : self::mix($accent, 5, self::rgb('#f8fafc'));
            $panel = self::mix($background, 92, self::rgb('#ffffff'));
            $text = self::rgb('#111827');

            return [
                'background' => $background,
                'sidebar' => self::mix($background, 92, self::rgb('#ffffff')),
                'header' => self::mix($background, 88, self::rgb('#ffffff')),
                'panel' => $panel,
                'panel_soft' => self::mix($background, 78, self::rgb('#ffffff')),
                'card' => self::mix($panel, 96, self::rgb('#ffffff')),
                'window_background' => self::mix($panel, 96, self::rgb('#ffffff')),
                'chat_background' => $background,
                'composer_background' => self::mix($panel, 95, self::rgb('#ffffff')),
                'composer_surface' => $panel,
                'composer_text' => $text,
                'text' => $text,
                'muted' => self::mix($text, 68, $background),
                'secondary_surface' => self::mix($secondary, 16, self::rgb('#ffffff')),
                'active' => self::mix($accent, 10, self::rgb('#ffffff')),
                'code_background' => self::mix($background, 74, self::rgb('#ffffff')),
                'code_surface' => self::mix($panel, 92, self::rgb('#ffffff')),
                'code_text' => $text,
            ];
        }

        $background = $preset['light']
            ? self::mix($accent, 10, self::rgb('#06080d'))
            : $background;
        $panel = self::mix($background, 86, self::rgb('#141a24'));
        $text = self::rgb('#edf2f7');

        return [
            'background' => $background,
            'sidebar' => self::mix($background, 92, self::rgb('#02060b')),
            'header' => self::mix($background, 90, self::rgb('#02060b')),
            'panel' => $panel,
            'panel_soft' => self::mix($panel, 74, self::rgb('#05070b')),
            'card' => self::mix($panel, 88, self::rgb('#05070b')),
            'window_background' => self::mix($panel, 92, self::rgb('#05070b')),
            'chat_background' => $background,
            'composer_background' => self::mix($panel, 84, self::rgb('#05070b')),
            'composer_surface' => $panel,
            'composer_text' => $text,
            'text' => $text,
            'muted' => self::mix($text, 68, $background),
            'secondary_surface' => self::mix($secondary, 16, $background),
            'active' => self::mix($accent, 14, $background),
            'code_background' => self::mix($background, 84, self::rgb('#05070b')),
            'code_surface' => self::mix($panel, 92, self::rgb('#05070b')),
            'code_text' => $text,
        ];
    }

    /**
     * @param array<string, array{0: float, 1: float, 2: float}> $style
     * @param array<int, array{0: string, 1: string}> $pairs
     */
    private static function pairsAreReadable(array $style, array $pairs): bool
    {
        foreach ($pairs as [$foreground, $background]) {
            if (! isset($style[$foreground], $style[$background])
                || self::contrast($style[$foreground], $style[$background]) < self::MINIMUM_NORMAL_TEXT_RATIO
            ) {
                return false;
            }
        }

        return true;
    }

    /** @param array{0: float, 1: float, 2: float} $first @param array{0: float, 1: float, 2: float} $second */
    private static function contrast(array $first, array $second): float
    {
        $bright = max(self::luminance($first), self::luminance($second));
        $dark = min(self::luminance($first), self::luminance($second));

        return ($bright + 0.05) / ($dark + 0.05);
    }

    /** @param array{0: float, 1: float, 2: float} $color */
    private static function luminance(array $color): float
    {
        $channels = array_map(
            static fn (float $value): float => $value <= 0.04045
                ? $value / 12.92
                : (($value + 0.055) / 1.055) ** 2.4,
            $color,
        );

        return (0.2126 * $channels[0]) + (0.7152 * $channels[1]) + (0.0722 * $channels[2]);
    }

    /**
     * @param array{0: float, 1: float, 2: float} $first
     * @param array{0: float, 1: float, 2: float} $second
     * @return array{0: float, 1: float, 2: float}
     */
    private static function mix(array $first, float $weight, array $second): array
    {
        $factor = $weight / 100;

        return [
            ($first[0] * $factor) + ($second[0] * (1 - $factor)),
            ($first[1] * $factor) + ($second[1] * (1 - $factor)),
            ($first[2] * $factor) + ($second[2] * (1 - $factor)),
        ];
    }

    /** @return array{0: float, 1: float, 2: float} */
    private static function rgb(string $hex): array
    {
        return [
            hexdec(substr($hex, 1, 2)) / 255,
            hexdec(substr($hex, 3, 2)) / 255,
            hexdec(substr($hex, 5, 2)) / 255,
        ];
    }

    /** @return array{0: float, 1: float, 2: float}|null */
    private static function color(mixed $value): ?array
    {
        return is_string($value) && preg_match('/^#[0-9a-f]{6}$/i', trim($value)) === 1
            ? self::rgb(strtolower(trim($value)))
            : null;
    }

    /** @return array<string, mixed> */
    private static function record(mixed $value): array
    {
        return is_array($value) && ! array_is_list($value) ? $value : [];
    }

    private static function themeId(mixed $value): string
    {
        return is_string($value) && isset(self::PRESETS[$value]) ? $value : 'forge';
    }

    /** @param array<string, array<int, string>> $errors */
    private static function addError(array &$errors, string $path, string $message): void
    {
        if (! isset($errors[$path])) {
            $errors[$path] = [];
        }
        if (! in_array($message, $errors[$path], true)) {
            $errors[$path][] = $message;
        }
    }
}
