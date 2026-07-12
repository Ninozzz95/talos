<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use stdClass;

final class TalosThemeMotionV6Migration
{
    private const LEGACY_MOTION_VALUES = ['system', 'off', 'subtle', 'normal', 'cinematic'];

    private const LEGACY_UI_PROFILES = ['preset', 'minimal', 'expressive', 'custom', 'off'];

    private const LEGACY_UI_EASINGS = ['precise', 'soft', 'elastic-light', 'linear', 'cinematic'];

    private const LEGACY_MOTION_KEYS = [
        'theme_motion',
        'theme_motion_disabled',
        'theme_simple_animation',
        'theme_background_disabled',
    ];

    private const ROOT_KEYS = [
        'theme_motion_v6',
        'theme_motion',
        'theme_motion_disabled',
        'theme_simple_animation',
        'theme_background_disabled',
        'ui_animation_profile',
        'ui_animation_customization',
    ];

    private const CUSTOMIZATION_KEYS = ['duration_scale', 'intensity', 'easing', 'stagger'];

    private const MAX_INSPECTION_NODES = 256;

    private const MAX_INSPECTION_DEPTH = 16;

    private const MAX_CONTAINER_KEYS = 64;

    /**
     * @return array{success: true, value: array<string, mixed>, source: 'v6'|'legacy'|'default', shouldPersist: false}|array{success: false, issues: array<int, array{path: string, code: string, message: string}>}
     */
    public static function resolve(mixed $input): array
    {
        $root = self::inspectKnownRecord($input, '$', self::ROOT_KEYS);
        if ($root['record'] === null) {
            return ['success' => false, 'issues' => [$root['issue']]];
        }

        if (array_key_exists('theme_motion_v6', $root['record'])) {
            $boundaryIssue = null;
            $nodes = 0;
            $activeObjects = [];
            self::inspectTree($root['record']['theme_motion_v6'], 'theme_motion_v6', $nodes, $boundaryIssue, 0, $activeObjects);
            if ($boundaryIssue !== null) {
                return ['success' => false, 'issues' => [$boundaryIssue]];
            }

            $parsed = TalosThemeMotionV6::parse($root['record']['theme_motion_v6']);
            if (! $parsed['success']) {
                return [
                    'success' => false,
                    'issues' => array_map(
                        static fn (array $issue): array => [
                            'path' => $issue['path'] === '$'
                                ? 'theme_motion_v6'
                                : 'theme_motion_v6.'.$issue['path'],
                            'code' => $issue['code'],
                            'message' => $issue['message'],
                        ],
                        $parsed['issues'],
                    ),
                ];
            }

            return [
                'success' => true,
                'value' => $parsed['value'],
                'source' => 'v6',
                'shouldPersist' => false,
            ];
        }

        return self::migrateLegacy($root['record']);
    }

    /**
     * @return array{theme_motion_v6: array<string, mixed>}
     */
    public static function firstSaveDelta(mixed $input): array
    {
        $boundaryIssue = null;
        $nodes = 0;
        $activeObjects = [];
        self::inspectTree($input, 'theme_motion_v6', $nodes, $boundaryIssue, 0, $activeObjects);
        if ($boundaryIssue !== null) {
            throw new InvalidArgumentException('Cannot create a V6 save delta from an unsafe motion payload.');
        }

        $parsed = TalosThemeMotionV6::parse($input);
        if (! $parsed['success']) {
            throw new InvalidArgumentException('Cannot create a V6 save delta from an invalid motion payload.');
        }

        return ['theme_motion_v6' => $parsed['value']];
    }

    public static function saveDelta(mixed $input): array
    {
        return self::firstSaveDelta($input);
    }

    /**
     * @param array<string, mixed>|null $record
     * @return array{success: true, value: array<string, mixed>, source: 'legacy'|'default', shouldPersist: false}|array{success: false, issues: array<int, array{path: string, code: string, message: string}>}
     */
    private static function migrateLegacy(?array $record): array
    {
        $value = TalosThemeMotionV6::defaults();
        $hasLegacy = false;
        $hasRendererLegacy = false;
        $motion = null;

        if (array_key_exists('theme_motion', $record)) {
            $hasLegacy = true;
        }
        if (array_key_exists('theme_motion', $record) && is_string($record['theme_motion']) && in_array($record['theme_motion'], self::LEGACY_MOTION_VALUES, true)) {
            $hasLegacy = true;
            $hasRendererLegacy = true;
            $motion = $record['theme_motion'];
            [$value['speed'], $value['intensity']] = match ($motion) {
                'system', 'off', 'normal' => [100, 65],
                'subtle' => [75, 40],
                'cinematic' => [140, 85],
            };
        }

        foreach (array_slice(self::LEGACY_MOTION_KEYS, 1) as $key) {
            if (array_key_exists($key, $record)) {
                $hasLegacy = true;
            }
            if (array_key_exists($key, $record) && is_bool($record[$key])) {
                $hasLegacy = true;
                $hasRendererLegacy = true;
            }
        }

        $customizationInspection = array_key_exists('ui_animation_customization', $record)
            ? self::inspectCustomization($record['ui_animation_customization'], 'ui_animation_customization')
            : ['record' => null];
        if (isset($customizationInspection['issue'])) {
            return ['success' => false, 'issues' => [$customizationInspection['issue']]];
        }
        $customization = $customizationInspection['record'];
        $profile = array_key_exists('ui_animation_profile', $record)
            && is_string($record['ui_animation_profile'])
            && in_array($record['ui_animation_profile'], self::LEGACY_UI_PROFILES, true)
            ? $record['ui_animation_profile']
            : null;
        if (array_key_exists('ui_animation_profile', $record) || array_key_exists('ui_animation_customization', $record)) {
            $hasLegacy = true;
        }

        if ($profile !== null) {
            $hasLegacy = true;
            $value['interface']['profile'] = $profile;
            $value['interface_enabled'] = $profile !== 'off';
        }

        if ($customization !== null) {
            $migrated = false;
            if (self::integerInRange($customization['duration_scale'] ?? null, 50, 150)) {
                $value['interface']['duration_scale'] = (int) $customization['duration_scale'];
                $migrated = true;
            }
            if (self::integerInRange($customization['intensity'] ?? null, 0, 100)) {
                $value['interface']['intensity'] = (int) $customization['intensity'];
                $migrated = true;
            }
            if (is_string($customization['easing'] ?? null) && in_array($customization['easing'], self::LEGACY_UI_EASINGS, true)) {
                $value['interface']['easing'] = $customization['easing'];
                $migrated = true;
            }
            if (self::integerInRange($customization['stagger'] ?? null, 0, 120)) {
                $value['interface']['stagger'] = (int) $customization['stagger'];
                $migrated = true;
            }
            if ($migrated || $customization !== []) {
                $hasLegacy = true;
            }
        }

        if (($record['theme_background_disabled'] ?? null) === true) {
            $value['mode'] = 'off';
            $value['background_enabled'] = false;
        } elseif ($motion === 'off' || ($record['theme_motion_disabled'] ?? null) === true) {
            $value['mode'] = 'static';
        } elseif (($record['theme_simple_animation'] ?? null) === false) {
            $value['mode'] = 'complex';
        } elseif ($hasRendererLegacy) {
            $value['mode'] = 'simple';
        }

        return ['success' => true, 'value' => $value, 'source' => $hasLegacy ? 'legacy' : 'default', 'shouldPersist' => false];
    }

    /**
     * @return array{record: array<string, mixed>|null, issue?: array{path: string, code: string, message: string}}
     */
    private static function inspectKnownRecord(mixed $value, string $path, array $keys): array
    {
        if (is_array($value)) {
            if (array_is_list($value) && $value !== []) {
                return ['record' => null, 'issue' => self::issue($path, 'invalid_type', "Expected a complete non-array object at \"{$path}\".")];
            }

            $record = [];
            foreach ($keys as $key) {
                if (array_key_exists($key, $value)) {
                    $record[$key] = $value[$key];
                }
            }
            return ['record' => $record];
        }

        if (is_scalar($value) || $value === null) {
            return ['record' => null, 'issue' => self::issue($path, 'invalid_type', "Expected a complete non-array object at \"{$path}\".")];
        }

        if (! $value instanceof stdClass || $value::class !== stdClass::class) {
            return ['record' => null, 'issue' => self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.")];
        }

        $record = [];
        foreach ($keys as $key) {
            if (property_exists($value, $key)) {
                $record[$key] = $value->{$key};
            }
        }

        return ['record' => $record];
    }

    private static function inspectCustomization(mixed $value, string $path): array
    {
        if ($value === null || is_scalar($value)) {
            return ['record' => null];
        }
        if (is_array($value)) {
            if (array_is_list($value)) {
                return ['record' => null];
            }
            $record = [];
            foreach (self::CUSTOMIZATION_KEYS as $key) {
                if (array_key_exists($key, $value)) {
                    $record[$key] = $value[$key];
                }
            }
            return ['record' => $record];
        }
        if (! $value instanceof stdClass || $value::class !== stdClass::class) {
            return ['record' => null, 'issue' => self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.")];
        }

        $record = [];
        foreach (self::CUSTOMIZATION_KEYS as $key) {
            if (property_exists($value, $key)) {
                $record[$key] = $value->{$key};
            }
        }
        return ['record' => $record];
    }

    private static function inspectTree(mixed $value, string $path, int &$nodes, ?array &$failure, int $depth, array &$activeObjects): void
    {
        if ($failure !== null) {
            return;
        }
        $nodes++;
        if ($nodes > self::MAX_INSPECTION_NODES || $depth > self::MAX_INSPECTION_DEPTH) {
            $failure = self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
            return;
        }
        if ($value === null || is_scalar($value)) {
            return;
        }
        if (is_array($value)) {
            if (count($value) > self::MAX_CONTAINER_KEYS) {
                $failure = self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
                return;
            }
            if (array_is_list($value)) {
                return;
            }
            foreach (array_keys($value) as $key) {
                if (is_int($key)) {
                    $failure = self::issue("{$path}.{$key}", 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
                    return;
                }
            }
            foreach ($value as $key => $nested) {
                self::inspectTree($nested, "{$path}.{$key}", $nodes, $failure, $depth + 1, $activeObjects);
                if ($failure !== null) return;
            }
            return;
        }
        if (! $value instanceof stdClass || $value::class !== stdClass::class) {
            $failure = self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
            return;
        }
        $objectId = spl_object_id($value);
        if (isset($activeObjects[$objectId])) {
            $failure = self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
            return;
        }
        $record = get_object_vars($value);
        if (count($record) > self::MAX_CONTAINER_KEYS) {
            $failure = self::issue($path, 'uninspectable_object', "Object at \"{$path}\" could not be inspected safely.");
            return;
        }
        $activeObjects[$objectId] = true;
        foreach ($record as $key => $nested) {
            self::inspectTree($nested, "{$path}.{$key}", $nodes, $failure, $depth + 1, $activeObjects);
            if ($failure !== null) break;
        }
        unset($activeObjects[$objectId]);
    }

    private static function integerInRange(mixed $value, int $min, int $max): bool
    {
        return (is_int($value) || is_float($value))
            && is_finite((float) $value)
            && floor((float) $value) === (float) $value
            && $value >= $min
            && $value <= $max;
    }

    /**
     * @return array{path: string, code: string, message: string}
     */
    private static function issue(string $path, string $code, string $message): array
    {
        return ['path' => $path, 'code' => $code, 'message' => $message];
    }
}
