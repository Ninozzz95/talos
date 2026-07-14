<?php

declare(strict_types=1);

namespace App\Support;

use stdClass;
use Throwable;

final class TalosThemeMotionV6
{
    public const MAX_PAYLOAD_BYTES = 16_384;

    private const MAX_ISSUES = 64;

    private const PREFLIGHT_MAX_DEPTH = 512;

    private const PREFLIGHT_MAX_NODES = 32_768;

    private const SERIALIZATION_ERROR_MESSAGE = 'Motion V6 payload could not be serialized safely.';

    private const MODES = ['off', 'static', 'simple', 'complex', 'adaptive'];

    private const QUALITY_LEVELS = ['low', 'balanced', 'high', 'adaptive'];

    private const SCENE_IDS = [
        'forge',
        'paper',
        'terminal',
        'aurora',
        'glacier',
        'ember',
        'atlas',
        'noir',
        'signal',
        'violet',
        'claudius',
        'basicus',
    ];

    private const FPS_CAPS = [20, 24, 30, 45, 60];

    private const DPR_CAPS = [1, 1.25, 1.5, 2];

    private const INTERFACE_PROFILES = ['preset', 'minimal', 'expressive', 'custom', 'off'];

    private const EASINGS = ['precise', 'soft', 'elastic-light', 'linear', 'cinematic'];

    private const TOP_LEVEL_KEYS = [
        'schema_version',
        'mode',
        'background_enabled',
        'interface_enabled',
        'scene_override',
        'speed',
        'intensity',
        'glow_intensity',
        'density',
        'depth',
        'trails',
        'contrast',
        'parallax',
        'quality',
        'fps_cap',
        'dpr_cap',
        'pause_when_hidden',
        'respect_data_saver',
        'interface',
    ];

    private const INTERFACE_KEYS = [
        'profile',
        'duration_scale',
        'intensity',
        'easing',
        'stagger',
        'categories',
    ];

    private const CATEGORY_KEYS = [
        'windows',
        'surfaces',
        'navigation',
        'composer',
        'messages',
        'feedback',
    ];

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'schema_version' => 1,
            'mode' => 'adaptive',
            'background_enabled' => true,
            'interface_enabled' => true,
            'scene_override' => null,
            'speed' => 100,
            'intensity' => 65,
            'glow_intensity' => 0,
            'density' => 100,
            'depth' => 50,
            'trails' => 35,
            'contrast' => 60,
            'parallax' => 20,
            'quality' => 'adaptive',
            'fps_cap' => 30,
            'dpr_cap' => 1.25,
            'pause_when_hidden' => true,
            'respect_data_saver' => true,
            'interface' => [
                'profile' => 'preset',
                'duration_scale' => 50,
                'intensity' => 65,
                'easing' => 'precise',
                'stagger' => 40,
                'categories' => [
                    'windows' => true,
                    'surfaces' => true,
                    'navigation' => true,
                    'composer' => true,
                    'messages' => true,
                    'feedback' => true,
                ],
            ],
        ];
    }

    /**
     * @return array{success: true, value: array<string, mixed>}|array{success: false, issues: array<int, array{path: string, code: string, message: string}>}
     */
    public static function parse(mixed $input): array
    {
        $payloadFailure = self::payloadBoundaryFailure($input);
        if ($payloadFailure !== null) {
            return $payloadFailure;
        }

        $issues = [];
        $top = self::snapshotObject($input, self::TOP_LEVEL_KEYS, '$', $issues, ['glow_intensity']);
        $interface = null;

        if ($top !== null) {
            if (array_key_exists('schema_version', $top)) {
                self::validateSchemaVersion($top['schema_version'], $issues);
            }
            if (array_key_exists('mode', $top)) {
                self::validateString($top['mode'], 'mode', self::MODES, $issues);
            }
            if (array_key_exists('background_enabled', $top)) {
                self::validateBoolean($top['background_enabled'], 'background_enabled', $issues);
            }
            if (array_key_exists('interface_enabled', $top)) {
                self::validateBoolean($top['interface_enabled'], 'interface_enabled', $issues);
            }
            if (array_key_exists('scene_override', $top) && $top['scene_override'] !== null) {
                self::validateString($top['scene_override'], 'scene_override', self::SCENE_IDS, $issues);
            }

            foreach ([
                'speed' => [25, 200],
                'intensity' => [0, 100],
                'glow_intensity' => [0, 100],
                'density' => [25, 150],
                'depth' => [0, 100],
                'trails' => [0, 100],
                'contrast' => [0, 100],
                'parallax' => [0, 100],
            ] as $key => [$min, $max]) {
                if (array_key_exists($key, $top)) {
                    self::validateIntegerRange($top[$key], $key, $min, $max, $issues);
                }
            }

            if (array_key_exists('quality', $top)) {
                self::validateString($top['quality'], 'quality', self::QUALITY_LEVELS, $issues);
            }
            if (array_key_exists('fps_cap', $top)) {
                self::validateNumberAllowlist($top['fps_cap'], 'fps_cap', self::FPS_CAPS, $issues);
            }
            if (array_key_exists('dpr_cap', $top)) {
                self::validateNumberAllowlist($top['dpr_cap'], 'dpr_cap', self::DPR_CAPS, $issues);
            }
            if (array_key_exists('pause_when_hidden', $top)) {
                self::validateBoolean($top['pause_when_hidden'], 'pause_when_hidden', $issues);
            }
            if (array_key_exists('respect_data_saver', $top)) {
                self::validateBoolean($top['respect_data_saver'], 'respect_data_saver', $issues);
            }

            $interface = array_key_exists('interface', $top)
                ? self::validateInterface($top['interface'], $issues)
                : null;
        }

        if ($issues !== [] || $top === null || $interface === null) {
            return ['success' => false, 'issues' => $issues];
        }

        $interfaceValues = $interface['value'];
        $categories = $interface['categories'];

        return [
            'success' => true,
            'value' => [
                'schema_version' => (int) $top['schema_version'],
                'mode' => $top['mode'],
                'background_enabled' => $top['background_enabled'],
                'interface_enabled' => $top['interface_enabled'],
                'scene_override' => $top['scene_override'],
                'speed' => (int) $top['speed'],
                'intensity' => (int) $top['intensity'],
                'glow_intensity' => array_key_exists('glow_intensity', $top)
                    ? (int) $top['glow_intensity']
                    : 0,
                'density' => (int) $top['density'],
                'depth' => (int) $top['depth'],
                'trails' => (int) $top['trails'],
                'contrast' => (int) $top['contrast'],
                'parallax' => (int) $top['parallax'],
                'quality' => $top['quality'],
                'fps_cap' => (int) $top['fps_cap'],
                'dpr_cap' => self::canonicalDprCap($top['dpr_cap']),
                'pause_when_hidden' => $top['pause_when_hidden'],
                'respect_data_saver' => $top['respect_data_saver'],
                'interface' => [
                    'profile' => $interfaceValues['profile'],
                    'duration_scale' => (int) $interfaceValues['duration_scale'],
                    'intensity' => (int) $interfaceValues['intensity'],
                    'easing' => $interfaceValues['easing'],
                    'stagger' => (int) $interfaceValues['stagger'],
                    'categories' => [
                        'windows' => $categories['windows'],
                        'surfaces' => $categories['surfaces'],
                        'navigation' => $categories['navigation'],
                        'composer' => $categories['composer'],
                        'messages' => $categories['messages'],
                        'feedback' => $categories['feedback'],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array{success: false, issues: array<int, array{path: string, code: string, message: string}>}|null
     */
    private static function payloadBoundaryFailure(mixed $input): ?array
    {
        $lowerBoundBytes = 0;
        $nodes = 0;
        $activeObjects = [];
        $preflightFailure = self::preflightValue(
            $input,
            0,
            $nodes,
            $lowerBoundBytes,
            $activeObjects,
        );

        if ($preflightFailure === 'payload_too_large') {
            return self::failure('$', 'payload_too_large', 'The JSON payload must not exceed 16384 bytes.');
        }
        if ($preflightFailure === 'serialization_error') {
            return self::failure('$', 'serialization_error', self::SERIALIZATION_ERROR_MESSAGE);
        }

        try {
            $encoded = json_encode(
                $input,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR,
                self::PREFLIGHT_MAX_DEPTH,
            );
        } catch (Throwable) {
            return self::failure('$', 'serialization_error', self::SERIALIZATION_ERROR_MESSAGE);
        }

        if (! is_string($encoded)
            || ! in_array(json_last_error(), [JSON_ERROR_NONE, JSON_ERROR_INF_OR_NAN], true)
        ) {
            return self::failure('$', 'serialization_error', self::SERIALIZATION_ERROR_MESSAGE);
        }
        if (strlen($encoded) > self::MAX_PAYLOAD_BYTES) {
            return self::failure('$', 'payload_too_large', 'The JSON payload must not exceed 16384 bytes.');
        }

        return null;
    }

    /**
     * @param array<int, true> $activeObjects
     * @return 'payload_too_large'|'serialization_error'|null
     */
    private static function preflightValue(
        mixed $value,
        int $depth,
        int &$nodes,
        int &$lowerBoundBytes,
        array &$activeObjects,
    ): ?string {
        $nodes++;
        if ($depth > self::PREFLIGHT_MAX_DEPTH || $nodes > self::PREFLIGHT_MAX_NODES) {
            return 'serialization_error';
        }

        if ($value === null) {
            return self::addPreflightBytes($lowerBoundBytes, 4) ? null : 'payload_too_large';
        }
        if (is_bool($value)) {
            $bytes = $value ? 4 : 5;

            return self::addPreflightBytes($lowerBoundBytes, $bytes) ? null : 'payload_too_large';
        }
        if (is_int($value)) {
            return self::addPreflightBytes($lowerBoundBytes, strlen((string) $value))
                ? null
                : 'payload_too_large';
        }
        if (is_float($value)) {
            return self::addPreflightBytes($lowerBoundBytes, 1) ? null : 'payload_too_large';
        }
        if (is_string($value)) {
            if (! self::addPreflightBytes($lowerBoundBytes, strlen($value) + 2)) {
                return 'payload_too_large';
            }

            return self::isValidUtf8($value) ? null : 'serialization_error';
        }
        if (is_array($value)) {
            if (! self::addPreflightBytes($lowerBoundBytes, 2)) {
                return 'payload_too_large';
            }

            return array_is_list($value)
                ? self::preflightList($value, $depth, $nodes, $lowerBoundBytes, $activeObjects)
                : self::preflightObjectRecord($value, $depth, $nodes, $lowerBoundBytes, $activeObjects);
        }
        if (! $value instanceof stdClass || $value::class !== stdClass::class) {
            return 'serialization_error';
        }
        if (! self::addPreflightBytes($lowerBoundBytes, 2)) {
            return 'payload_too_large';
        }

        $objectId = spl_object_id($value);
        if (isset($activeObjects[$objectId])) {
            return 'serialization_error';
        }
        $activeObjects[$objectId] = true;
        try {
            return self::preflightObjectRecord(
                get_object_vars($value),
                $depth,
                $nodes,
                $lowerBoundBytes,
                $activeObjects,
            );
        } finally {
            unset($activeObjects[$objectId]);
        }
    }

    /**
     * @param array<int, mixed> $values
     * @param array<int, true> $activeObjects
     * @return 'payload_too_large'|'serialization_error'|null
     */
    private static function preflightList(
        array $values,
        int $depth,
        int &$nodes,
        int &$lowerBoundBytes,
        array &$activeObjects,
    ): ?string {
        foreach ($values as $index => $value) {
            if ($index > 0 && ! self::addPreflightBytes($lowerBoundBytes, 1)) {
                return 'payload_too_large';
            }
            $failure = self::preflightValue(
                $value,
                $depth + 1,
                $nodes,
                $lowerBoundBytes,
                $activeObjects,
            );
            if ($failure !== null) {
                return $failure;
            }
        }

        return null;
    }

    /**
     * @param array<mixed> $record
     * @param array<int, true> $activeObjects
     * @return 'payload_too_large'|'serialization_error'|null
     */
    private static function preflightObjectRecord(
        array $record,
        int $depth,
        int &$nodes,
        int &$lowerBoundBytes,
        array &$activeObjects,
    ): ?string {
        $index = 0;
        foreach ($record as $key => $value) {
            $key = (string) $key;
            $keyBytes = strlen($key) + 3 + ($index > 0 ? 1 : 0);
            if (! self::addPreflightBytes($lowerBoundBytes, $keyBytes)) {
                return 'payload_too_large';
            }
            if (! self::isValidUtf8($key)) {
                return 'serialization_error';
            }

            $failure = self::preflightValue(
                $value,
                $depth + 1,
                $nodes,
                $lowerBoundBytes,
                $activeObjects,
            );
            if ($failure !== null) {
                return $failure;
            }
            $index++;
        }

        return null;
    }

    private static function addPreflightBytes(int &$lowerBoundBytes, int $additionalBytes): bool
    {
        if ($additionalBytes > self::MAX_PAYLOAD_BYTES - $lowerBoundBytes) {
            $lowerBoundBytes = self::MAX_PAYLOAD_BYTES + 1;

            return false;
        }

        $lowerBoundBytes += $additionalBytes;

        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function validationErrors(mixed $input, string $fieldPath = 'preferences.theme_motion_v6'): array
    {
        return self::validationErrorsForResult(self::parse($input), $fieldPath);
    }

    /**
     * @param array<string, mixed> $result
     * @return array<string, array<int, string>>
     */
    public static function validationErrorsForResult(
        array $result,
        string $fieldPath = 'preferences.theme_motion_v6',
    ): array {
        if (($result['success'] ?? false) === true) {
            return [];
        }

        $errors = [];
        foreach ($result['issues'] ?? [] as $issue) {
            $path = $issue['path'] === '$' ? $fieldPath : "{$fieldPath}.{$issue['path']}";
            $code = 'TALOS_THEME_MOTION_V6_'.strtoupper($issue['code']);
            $errors[$fieldPath][] = "{$code} field={$path}: {$issue['message']}";
        }

        return $errors;
    }

    /**
     * @param array<int, array{path: string, code: string, message: string}> $issues
     * @return array{value: array<string, mixed>, categories: array<string, mixed>}|null
     */
    private static function validateInterface(mixed $value, array &$issues): ?array
    {
        $interface = self::snapshotObject($value, self::INTERFACE_KEYS, 'interface', $issues);
        if ($interface === null) {
            return null;
        }

        if (array_key_exists('profile', $interface)) {
            self::validateString($interface['profile'], 'interface.profile', self::INTERFACE_PROFILES, $issues);
        }
        if (array_key_exists('duration_scale', $interface)) {
            self::validateIntegerRange($interface['duration_scale'], 'interface.duration_scale', 50, 150, $issues);
        }
        if (array_key_exists('intensity', $interface)) {
            self::validateIntegerRange($interface['intensity'], 'interface.intensity', 0, 100, $issues);
        }
        if (array_key_exists('easing', $interface)) {
            self::validateString($interface['easing'], 'interface.easing', self::EASINGS, $issues);
        }
        if (array_key_exists('stagger', $interface)) {
            self::validateIntegerRange($interface['stagger'], 'interface.stagger', 0, 120, $issues);
        }

        if (! array_key_exists('categories', $interface)) {
            return null;
        }

        $categories = self::snapshotObject(
            $interface['categories'],
            self::CATEGORY_KEYS,
            'interface.categories',
            $issues,
        );
        if ($categories === null) {
            return null;
        }

        foreach (self::CATEGORY_KEYS as $key) {
            if (array_key_exists($key, $categories)) {
                self::validateBoolean($categories[$key], "interface.categories.{$key}", $issues);
            }
        }

        return ['value' => $interface, 'categories' => $categories];
    }

    /**
     * @param array<int, string> $expectedKeys
     * @param array<int, array{path: string, code: string, message: string}> $issues
     * @param array<int, string> $optionalKeys
     * @return array<string, mixed>|null
     */
    private static function snapshotObject(
        mixed $value,
        array $expectedKeys,
        string $parentPath,
        array &$issues,
        array $optionalKeys = [],
    ): ?array {
        if (is_array($value) && ! array_is_list($value)) {
            $record = $value;
        } elseif ($value instanceof stdClass && $value::class === stdClass::class) {
            $record = get_object_vars($value);
        } else {
            self::addIssue($issues, $parentPath, 'invalid_type', 'Expected a complete non-array object.');

            return null;
        }

        $expected = array_fill_keys($expectedKeys, true);
        $optional = array_fill_keys($optionalKeys, true);
        foreach ($expectedKeys as $key) {
            if (! array_key_exists($key, $record) && ! isset($optional[$key])) {
                self::addIssue($issues, self::pathFor($parentPath, $key), 'missing_key', 'Missing required key.');
            }
        }

        $unknownKeys = [];
        foreach (array_keys($record) as $key) {
            if (! is_string($key) || ! isset($expected[$key])) {
                $unknownKeys[] = (string) $key;
            }
        }
        usort($unknownKeys, [self::class, 'compareUtf16Strings']);
        foreach ($unknownKeys as $key) {
            self::addIssue(
                $issues,
                self::pathFor($parentPath, $key),
                'unknown_key',
                'Unknown key. Remove it from the payload.',
            );
        }

        $snapshot = [];
        foreach ($expectedKeys as $key) {
            if (array_key_exists($key, $record)) {
                $snapshot[$key] = $record[$key];
            }
        }

        return $snapshot;
    }

    /**
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function validateSchemaVersion(mixed $value, array &$issues): void
    {
        if (! is_int($value) && ! is_float($value)) {
            self::addIssue($issues, 'schema_version', 'invalid_type', 'schema_version must equal 1.');

            return;
        }
        if (! is_finite((float) $value)) {
            self::addIssue($issues, 'schema_version', 'not_finite', 'schema_version must equal 1.');

            return;
        }
        if ((float) $value !== 1.0) {
            self::addIssue($issues, 'schema_version', 'invalid_value', 'schema_version must equal 1.');
        }
    }

    /**
     * @param array<int, string> $allowed
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function validateString(mixed $value, string $path, array $allowed, array &$issues): void
    {
        if (! is_string($value)) {
            self::addIssue($issues, $path, 'invalid_type', 'Expected an allowlisted string.');
        } elseif (! in_array($value, $allowed, true)) {
            self::addIssue($issues, $path, 'invalid_value', 'Value is not allowed. Choose a documented value.');
        }
    }

    /**
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function validateBoolean(mixed $value, string $path, array &$issues): void
    {
        if (! is_bool($value)) {
            self::addIssue($issues, $path, 'invalid_type', 'Expected a boolean.');
        }
    }

    /**
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function validateIntegerRange(
        mixed $value,
        string $path,
        int $min,
        int $max,
        array &$issues,
    ): void {
        if (! is_int($value) && ! is_float($value)) {
            self::addIssue($issues, $path, 'invalid_type', 'Expected a finite integer.');
        } elseif (! is_finite((float) $value)) {
            self::addIssue($issues, $path, 'not_finite', 'Expected a finite integer.');
        } elseif (floor((float) $value) !== (float) $value) {
            self::addIssue($issues, $path, 'not_integer', 'Value must be an integer.');
        } elseif ($value < $min || $value > $max) {
            self::addIssue($issues, $path, 'out_of_range', "Value must be an integer from {$min} through {$max}.");
        }
    }

    /**
     * @param array<int, int|float> $allowed
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function validateNumberAllowlist(
        mixed $value,
        string $path,
        array $allowed,
        array &$issues,
    ): void {
        if (! is_int($value) && ! is_float($value)) {
            self::addIssue($issues, $path, 'invalid_type', 'Expected an allowlisted finite number.');

            return;
        }
        if (! is_finite((float) $value)) {
            self::addIssue($issues, $path, 'not_finite', 'Expected an allowlisted finite number.');

            return;
        }
        foreach ($allowed as $allowedValue) {
            if ((float) $value === (float) $allowedValue) {
                return;
            }
        }
        self::addIssue($issues, $path, 'invalid_value', 'Value is not allowed. Choose a documented value.');
    }

    private static function canonicalDprCap(mixed $value): int|float
    {
        return match ((float) $value) {
            1.0 => 1,
            1.25 => 1.25,
            1.5 => 1.5,
            2.0 => 2,
        };
    }

    /**
     * @return array{success: false, issues: array<int, array{path: string, code: string, message: string}>}
     */
    private static function failure(string $path, string $code, string $message): array
    {
        return [
            'success' => false,
            'issues' => [['path' => $path, 'code' => $code, 'message' => $message]],
        ];
    }

    private static function pathFor(string $parentPath, string $key): string
    {
        return $parentPath === '$' ? $key : "{$parentPath}.{$key}";
    }

    private static function compareUtf16Strings(string $left, string $right): int
    {
        $leftUnits = self::utf16CodeUnits($left);
        $rightUnits = self::utf16CodeUnits($right);
        $sharedLength = min(count($leftUnits), count($rightUnits));

        for ($index = 0; $index < $sharedLength; $index++) {
            if ($leftUnits[$index] !== $rightUnits[$index]) {
                return $leftUnits[$index] <=> $rightUnits[$index];
            }
        }

        return count($leftUnits) <=> count($rightUnits);
    }

    /**
     * @return array<int, int>
     */
    private static function utf16CodeUnits(string $value): array
    {
        $units = [];
        $length = strlen($value);

        for ($offset = 0; $offset < $length;) {
            [$codePoint, $width] = self::decodeUtf8CodePoint($value, $offset);
            $offset += $width;

            if ($codePoint <= 0xFFFF) {
                $units[] = $codePoint;
                continue;
            }

            $supplementary = $codePoint - 0x10000;
            $units[] = 0xD800 + ($supplementary >> 10);
            $units[] = 0xDC00 + ($supplementary & 0x3FF);
        }

        return $units;
    }

    private static function isValidUtf8(string $value): bool
    {
        $length = strlen($value);
        for ($offset = 0; $offset < $length;) {
            [, $width, $valid] = self::decodeUtf8CodePoint($value, $offset);
            if (! $valid) {
                return false;
            }
            $offset += $width;
        }

        return true;
    }

    /**
     * @return array{0: int, 1: int, 2: bool}
     */
    private static function decodeUtf8CodePoint(string $value, int $offset): array
    {
        $length = strlen($value);
        $first = ord($value[$offset]);

        if ($first <= 0x7F) {
            return [$first, 1, true];
        }

        if ($first >= 0xC2 && $first <= 0xDF && $offset + 1 < $length) {
            $second = ord($value[$offset + 1]);
            if ($second >= 0x80 && $second <= 0xBF) {
                return [(($first & 0x1F) << 6) | ($second & 0x3F), 2, true];
            }
        }

        if ($first >= 0xE0 && $first <= 0xEF && $offset + 2 < $length) {
            $second = ord($value[$offset + 1]);
            $third = ord($value[$offset + 2]);
            $validSecond = ($first === 0xE0 && $second >= 0xA0 && $second <= 0xBF)
                || ($first >= 0xE1 && $first <= 0xEC && $second >= 0x80 && $second <= 0xBF)
                || ($first === 0xED && $second >= 0x80 && $second <= 0x9F)
                || ($first >= 0xEE && $second >= 0x80 && $second <= 0xBF);
            if ($validSecond && $third >= 0x80 && $third <= 0xBF) {
                return [
                    (($first & 0x0F) << 12) | (($second & 0x3F) << 6) | ($third & 0x3F),
                    3,
                    true,
                ];
            }
        }

        if ($first >= 0xF0 && $first <= 0xF4 && $offset + 3 < $length) {
            $second = ord($value[$offset + 1]);
            $third = ord($value[$offset + 2]);
            $fourth = ord($value[$offset + 3]);
            $validSecond = ($first === 0xF0 && $second >= 0x90 && $second <= 0xBF)
                || ($first >= 0xF1 && $first <= 0xF3 && $second >= 0x80 && $second <= 0xBF)
                || ($first === 0xF4 && $second >= 0x80 && $second <= 0x8F);
            if ($validSecond
                && $third >= 0x80 && $third <= 0xBF
                && $fourth >= 0x80 && $fourth <= 0xBF
            ) {
                return [
                    (($first & 0x07) << 18)
                        | (($second & 0x3F) << 12)
                        | (($third & 0x3F) << 6)
                        | ($fourth & 0x3F),
                    4,
                    true,
                ];
            }
        }

        return [$first, 1, false];
    }

    /**
     * @param array<int, array{path: string, code: string, message: string}> $issues
     */
    private static function addIssue(array &$issues, string $path, string $code, string $message): void
    {
        if (count($issues) < self::MAX_ISSUES) {
            $issues[] = ['path' => $path, 'code' => $code, 'message' => $message];
        }
    }
}
