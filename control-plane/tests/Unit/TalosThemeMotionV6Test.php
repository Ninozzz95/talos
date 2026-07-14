<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosWorkspaceSetting;
use App\Support\TalosThemeMotionV6;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TalosThemeMotionV6Test extends TestCase
{
    private const SERIALIZATION_ISSUE = [
        'path' => '$',
        'code' => 'serialization_error',
        'message' => 'Motion V6 payload could not be serialized safely.',
    ];

    public function test_defaults_match_typescript_exactly_and_are_independent_copies(): void
    {
        $expected = self::canonicalDefaults();
        $first = TalosThemeMotionV6::defaults();
        $second = TalosThemeMotionV6::defaults();

        self::assertSame($expected, $first);
        self::assertSame($expected, $second);

        $first['interface']['categories']['windows'] = false;
        self::assertTrue($second['interface']['categories']['windows']);
    }

    public function test_parser_accepts_associative_arrays_and_plain_stdclass_with_exact_independent_output(): void
    {
        $expected = self::canonicalDefaults();
        $object = json_decode(json_encode($expected, JSON_THROW_ON_ERROR), false, 32, JSON_THROW_ON_ERROR);

        $arrayResult = TalosThemeMotionV6::parse($expected);
        $objectResult = TalosThemeMotionV6::parse($object);

        self::assertSame(['success' => true, 'value' => $expected], $arrayResult);
        self::assertSame(['success' => true, 'value' => $expected], $objectResult);

        $expected['interface']['categories']['feedback'] = false;
        self::assertTrue($arrayResult['value']['interface']['categories']['feedback']);
    }

    public function test_parser_preserves_an_explicitly_saved_interface_duration_scale(): void
    {
        $input = self::canonicalDefaults();
        $input['interface']['duration_scale'] = 100;

        $result = TalosThemeMotionV6::parse($input);

        self::assertTrue($result['success']);
        self::assertSame(100, $result['value']['interface']['duration_scale']);
    }

    public function test_parser_accepts_legacy_v6_without_glow_intensity_and_canonicalizes_it_off(): void
    {
        $input = self::canonicalDefaults();
        unset($input['glow_intensity']);

        $result = TalosThemeMotionV6::parse($input);

        self::assertTrue($result['success']);
        self::assertSame(0, $result['value']['glow_intensity']);
        self::assertSame(array_keys(self::canonicalDefaults()), array_keys($result['value']));
    }

    #[DataProvider('stringAllowlistProvider')]
    public function test_string_allowlists_match_typescript(string $path, array $allowed): void
    {
        foreach ($allowed as $value) {
            $input = self::withValue($path, $value);
            self::assertTrue(TalosThemeMotionV6::parse($input)['success'], "{$path} rejected {$value}");
        }

        $result = TalosThemeMotionV6::parse(self::withValue($path, '__not_allowed__'));
        self::assertSame([['path' => $path, 'code' => 'invalid_value']], self::issueIdentity($result));
    }

    public static function stringAllowlistProvider(): array
    {
        return [
            'mode' => ['mode', ['off', 'static', 'simple', 'complex', 'adaptive']],
            'scene override' => ['scene_override', ['forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus']],
            'quality' => ['quality', ['low', 'balanced', 'high', 'adaptive']],
            'interface profile' => ['interface.profile', ['preset', 'minimal', 'expressive', 'custom', 'off']],
            'interface easing' => ['interface.easing', ['precise', 'soft', 'elastic-light', 'linear', 'cinematic']],
        ];
    }

    #[DataProvider('rangeProvider')]
    public function test_integer_ranges_accept_both_edges_and_reject_both_outside_edges(
        string $path,
        int $min,
        int $max,
    ): void {
        foreach ([$min, $max] as $edge) {
            self::assertTrue(TalosThemeMotionV6::parse(self::withValue($path, $edge))['success']);
        }

        foreach ([$min - 1, $max + 1] as $outside) {
            $result = TalosThemeMotionV6::parse(self::withValue($path, $outside));
            self::assertSame([['path' => $path, 'code' => 'out_of_range']], self::issueIdentity($result));
        }

        $fraction = TalosThemeMotionV6::parse(self::withValue($path, $min + 0.5));
        self::assertSame([['path' => $path, 'code' => 'not_integer']], self::issueIdentity($fraction));
    }

    public static function rangeProvider(): array
    {
        return [
            'speed' => ['speed', 25, 200],
            'intensity' => ['intensity', 0, 100],
            'glow intensity' => ['glow_intensity', 0, 100],
            'density' => ['density', 25, 150],
            'depth' => ['depth', 0, 100],
            'trails' => ['trails', 0, 100],
            'contrast' => ['contrast', 0, 100],
            'parallax' => ['parallax', 0, 100],
            'interface duration scale' => ['interface.duration_scale', 50, 150],
            'interface intensity' => ['interface.intensity', 0, 100],
            'interface stagger' => ['interface.stagger', 0, 120],
        ];
    }

    #[DataProvider('numberAllowlistProvider')]
    public function test_number_allowlists_match_typescript(string $path, array $allowed, float|int $invalid): void
    {
        foreach ($allowed as $value) {
            self::assertTrue(TalosThemeMotionV6::parse(self::withValue($path, $value))['success']);
        }

        $result = TalosThemeMotionV6::parse(self::withValue($path, $invalid));
        self::assertSame([['path' => $path, 'code' => 'invalid_value']], self::issueIdentity($result));
    }

    public static function numberAllowlistProvider(): array
    {
        return [
            'fps' => ['fps_cap', [20, 24, 30, 45, 60], 25],
            'dpr' => ['dpr_cap', [1, 1.25, 1.5, 2], 1.75],
        ];
    }

    public function test_boolean_fields_and_every_category_are_strict(): void
    {
        foreach (['background_enabled', 'interface_enabled', 'pause_when_hidden', 'respect_data_saver'] as $path) {
            foreach ([true, false] as $value) {
                self::assertTrue(TalosThemeMotionV6::parse(self::withValue($path, $value))['success']);
            }
            self::assertSame(
                [['path' => $path, 'code' => 'invalid_type']],
                self::issueIdentity(TalosThemeMotionV6::parse(self::withValue($path, 1))),
            );
        }

        foreach (['windows', 'surfaces', 'navigation', 'composer', 'messages', 'feedback'] as $category) {
            $path = "interface.categories.{$category}";
            self::assertTrue(TalosThemeMotionV6::parse(self::withValue($path, false))['success']);
            self::assertSame(
                [['path' => $path, 'code' => 'invalid_type']],
                self::issueIdentity(TalosThemeMotionV6::parse(self::withValue($path, 'false'))),
            );
        }
    }

    #[DataProvider('wrongTypeProvider')]
    public function test_wrong_types_are_rejected_without_coercion(string $path, mixed $value): void
    {
        $result = TalosThemeMotionV6::parse(self::withValue($path, $value));

        self::assertSame([['path' => $path, 'code' => 'invalid_type']], self::issueIdentity($result));
    }

    public static function wrongTypeProvider(): array
    {
        return [
            'schema string' => ['schema_version', '1'],
            'mode number' => ['mode', 1],
            'scene boolean' => ['scene_override', false],
            'speed string' => ['speed', '100'],
            'glow intensity string' => ['glow_intensity', '0'],
            'quality number' => ['quality', 1],
            'fps string' => ['fps_cap', '30'],
            'dpr string' => ['dpr_cap', '1.25'],
            'interface profile number' => ['interface.profile', 1],
            'interface duration string' => ['interface.duration_scale', '100'],
            'interface easing list' => ['interface.easing', []],
            'interface stagger string' => ['interface.stagger', '40'],
        ];
    }

    public function test_non_finite_schema_and_speed_values_are_classified_before_serialization(): void
    {
        foreach (['schema_version', 'speed'] as $path) {
            foreach ([NAN, INF, -INF] as $value) {
                $result = TalosThemeMotionV6::parse(self::withValue($path, $value));
                self::assertSame(
                    [['path' => $path, 'code' => 'not_finite']],
                    self::issueIdentity($result),
                );
            }
        }
    }

    public function test_numeric_fields_are_returned_in_canonical_types(): void
    {
        $input = self::canonicalDefaults();
        foreach ([
            'schema_version',
            'speed',
            'intensity',
            'glow_intensity',
            'density',
            'depth',
            'trails',
            'contrast',
            'parallax',
            'fps_cap',
        ] as $key) {
            $input[$key] = (float) $input[$key];
        }
        foreach (['duration_scale', 'intensity', 'stagger'] as $key) {
            $input['interface'][$key] = (float) $input['interface'][$key];
        }

        self::assertSame(
            ['success' => true, 'value' => self::canonicalDefaults()],
            TalosThemeMotionV6::parse($input),
        );

        foreach ([[1.0, 1], [1.25, 1.25], [1.5, 1.5], [2.0, 2]] as [$inputDpr, $canonicalDpr]) {
            $expected = self::canonicalDefaults();
            $expected['dpr_cap'] = $canonicalDpr;
            self::assertSame(
                ['success' => true, 'value' => $expected],
                TalosThemeMotionV6::parse(self::withValue('dpr_cap', $inputDpr)),
            );
        }
    }

    public function test_json_serialization_failures_return_one_constant_safe_issue_and_stop(): void
    {
        $invalidUtf8 = self::withValue('mode', "\xB1\x31");

        $recursive = self::canonicalDefaults();
        $cycle = [];
        $cycle['self'] = &$cycle;
        $recursive['unexpected_recursive_value'] = $cycle;

        $tooDeep = self::canonicalDefaults();
        $deep = [];
        for ($index = 0; $index < 600; $index++) {
            $deep = ['next' => $deep];
        }
        $tooDeep['unexpected_deep_value'] = $deep;

        $resource = fopen('php://memory', 'rb');
        self::assertIsResource($resource);
        $unsupported = self::withValue('mode', $resource);

        try {
            foreach ([$invalidUtf8, $recursive, $tooDeep, $unsupported] as $input) {
                $result = TalosThemeMotionV6::parse($input);
                self::assertSame(['success' => false, 'issues' => [self::SERIALIZATION_ISSUE]], $result);
                self::assertSame(
                    ['preferences.theme_motion_v6' => [
                        'TALOS_THEME_MOTION_V6_SERIALIZATION_ERROR field=preferences.theme_motion_v6: Motion V6 payload could not be serialized safely.',
                    ]],
                    TalosThemeMotionV6::validationErrors($input),
                );
                json_encode($result, JSON_THROW_ON_ERROR);
            }
        } finally {
            fclose($resource);
        }
    }

    public function test_json_serializable_throwable_is_bounded_at_the_serialization_boundary(): void
    {
        $counter = new class
        {
            public int $calls = 0;
        };
        $input = new class($counter) implements \JsonSerializable
        {
            public function __construct(private object $counter) {}

            public function jsonSerialize(): mixed
            {
                $this->counter->calls++;
                throw new \Error('sensitive serialization failure');
            }
        };

        try {
            $result = TalosThemeMotionV6::parse($input);
        } catch (\Throwable $throwable) {
            self::fail('Serialization throwable escaped the parser boundary: '.get_debug_type($throwable));
        }

        self::assertSame(['success' => false, 'issues' => [self::SERIALIZATION_ISSUE]], $result);
        self::assertSame(0, $counter->calls);
    }

    public function test_unknown_json_serializable_value_is_rejected_without_side_effects(): void
    {
        $counter = new class
        {
            public int $calls = 0;
        };
        $sideEffect = new class($counter) implements \JsonSerializable
        {
            public function __construct(private object $counter) {}

            public function jsonSerialize(): mixed
            {
                $this->counter->calls++;

                return ['unsafe' => true];
            }
        };
        $input = self::canonicalDefaults();
        $input['unknown_side_effect'] = $sideEffect;

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame(['success' => false, 'issues' => [self::SERIALIZATION_ISSUE]], $result);
        self::assertSame(0, $counter->calls);
    }

    public function test_magic_getter_object_is_rejected_without_invoking_the_getter(): void
    {
        $counter = new class
        {
            public int $calls = 0;
        };
        $input = new class($counter)
        {
            public function __construct(private object $counter) {}

            public function __get(string $name): mixed
            {
                $this->counter->calls++;

                return null;
            }
        };

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame(['success' => false, 'issues' => [self::SERIALIZATION_ISSUE]], $result);
        self::assertSame(0, $counter->calls);
    }

    public function test_unknown_keys_are_sorted_lexicographically_before_the_sixty_four_issue_cap(): void
    {
        $input = self::canonicalDefaults();
        for ($index = 69; $index >= 0; $index--) {
            $input[sprintf('unknown-%03d', $index)] = true;
        }

        $result = TalosThemeMotionV6::parse($input);

        self::assertFalse($result['success']);
        self::assertCount(64, $result['issues']);
        self::assertSame(
            array_map(static fn (int $index): string => sprintf('unknown-%03d', $index), range(0, 63)),
            array_column($result['issues'], 'path'),
        );
        self::assertSame(array_fill(0, 64, 'unknown_key'), array_column($result['issues'], 'code'));
    }

    public function test_unknown_key_issue_cap_uses_javascript_utf16_code_unit_order(): void
    {
        $input = self::canonicalDefaults();
        $asciiKeys = array_map(
            static fn (int $index): string => sprintf('ascii-%02d', $index),
            range(0, 62),
        );
        foreach (array_reverse($asciiKeys) as $key) {
            $input[$key] = true;
        }
        $input["\u{E000}"] = true;
        $input["\u{10000}"] = true;

        $result = TalosThemeMotionV6::parse($input);

        self::assertFalse($result['success']);
        self::assertCount(64, $result['issues']);
        self::assertSame(
            [...$asciiKeys, "\u{10000}"],
            array_column($result['issues'], 'path'),
        );
        self::assertNotContains("\u{E000}", array_column($result['issues'], 'path'));
    }

    public function test_unknown_non_finite_value_reports_only_unknown_key(): void
    {
        $input = self::canonicalDefaults();
        $input['unknown_non_finite'] = INF;

        self::assertSame(
            [['path' => 'unknown_non_finite', 'code' => 'unknown_key']],
            self::issueIdentity(TalosThemeMotionV6::parse($input)),
        );
    }

    public function test_sixty_four_unknown_issues_hide_known_non_finite_issue_like_typescript(): void
    {
        $input = self::canonicalDefaults();
        for ($index = 63; $index >= 0; $index--) {
            $input[sprintf('unknown-%02d', $index)] = true;
        }
        $input['speed'] = INF;

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame(
            array_map(
                static fn (int $index): array => [
                    'path' => sprintf('unknown-%02d', $index),
                    'code' => 'unknown_key',
                ],
                range(0, 63),
            ),
            self::issueIdentity($result),
        );
    }

    #[DataProvider('missingKeyProvider')]
    public function test_missing_keys_do_not_emit_duplicate_type_diagnostics(string $path): void
    {
        $input = self::canonicalDefaults();
        self::unsetPath($input, $path);

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame([['path' => $path, 'code' => 'missing_key']], self::issueIdentity($result));
    }

    public static function missingKeyProvider(): array
    {
        return [
            'top level' => ['mode'],
            'interface' => ['interface.easing'],
            'categories object' => ['interface.categories'],
            'nested category' => ['interface.categories.feedback'],
        ];
    }

    public function test_nested_unknown_keys_are_sorted_and_actionable(): void
    {
        $input = self::canonicalDefaults();
        $input['interface']['categories']['zeta'] = true;
        $input['interface']['categories']['alpha'] = true;

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame([
            ['path' => 'interface.categories.alpha', 'code' => 'unknown_key'],
            ['path' => 'interface.categories.zeta', 'code' => 'unknown_key'],
        ], self::issueIdentity($result));
    }

    public function test_object_and_list_boundaries_match_json_semantics(): void
    {
        self::assertSame(
            [['path' => '$', 'code' => 'invalid_type']],
            self::issueIdentity(TalosThemeMotionV6::parse([])),
        );

        $emptyObject = TalosThemeMotionV6::parse((object) []);
        self::assertSame('missing_key', $emptyObject['issues'][0]['code']);
        self::assertSame('schema_version', $emptyObject['issues'][0]['path']);
        self::assertNotContains('invalid_type', array_column($emptyObject['issues'], 'code'));

        self::assertSame(
            ['success' => false, 'issues' => [self::SERIALIZATION_ISSUE]],
            TalosThemeMotionV6::parse(new \ArrayObject(self::canonicalDefaults())),
        );
    }

    #[DataProvider('oversizedUnknownKeyCountProvider')]
    public function test_oversized_unknown_keys_short_circuit_before_tail_side_effect(
        int $unknownKeyCount,
    ): void {
        $counter = new class
        {
            public int $calls = 0;
        };
        $tail = new class($counter) implements \JsonSerializable
        {
            public function __construct(private object $counter) {}

            public function jsonSerialize(): mixed
            {
                $this->counter->calls++;

                return true;
            }
        };
        $input = self::canonicalDefaults();
        for ($index = 0; $index < $unknownKeyCount; $index++) {
            $input[sprintf('unknown-%05d', $index)] = 'x';
        }
        $input['zz-tail-side-effect'] = $tail;

        $startedAt = hrtime(true);
        $result = TalosThemeMotionV6::parse($input);
        $elapsedNanoseconds = hrtime(true) - $startedAt;

        self::assertSame([
            'success' => false,
            'issues' => [[
                'path' => '$',
                'code' => 'payload_too_large',
                'message' => 'The JSON payload must not exceed 16384 bytes.',
            ]],
        ], $result);
        self::assertSame(0, $counter->calls);
        self::assertLessThan(
            500_000_000,
            $elapsedNanoseconds,
            "Bounded preflight exceeded 500ms for {$unknownKeyCount} unknown keys.",
        );
    }

    public static function oversizedUnknownKeyCountProvider(): array
    {
        return [
            'ten thousand' => [10_000],
            'fifty thousand' => [50_000],
        ];
    }

    public function test_parser_rejects_payload_over_sixteen_kibibytes_before_field_validation(): void
    {
        $input = self::withValue('interface.categories.feedback', str_repeat('x', 16_384));

        $result = TalosThemeMotionV6::parse($input);

        self::assertSame([
            'success' => false,
            'issues' => [[
                'path' => '$',
                'code' => 'payload_too_large',
                'message' => 'The JSON payload must not exceed 16384 bytes.',
            ]],
        ], $result);
    }

    public function test_exact_json_size_rejects_escaping_that_exceeds_the_limit(): void
    {
        $input = self::withValue('mode', str_repeat("\n", 9_000));

        self::assertSame([
            'success' => false,
            'issues' => [[
                'path' => '$',
                'code' => 'payload_too_large',
                'message' => 'The JSON payload must not exceed 16384 bytes.',
            ]],
        ], TalosThemeMotionV6::parse($input));
    }

    public function test_invalid_stored_v6_is_omitted_by_the_read_sanitizer_without_fallback(): void
    {
        $invalid = self::canonicalDefaults();
        unset($invalid['interface']['categories']['feedback']);

        self::assertSame(
            ['density' => 'compact'],
            TalosWorkspaceSetting::sanitizePreferences([
                'density' => 'compact',
                'theme_motion_v6' => $invalid,
            ]),
        );
    }

    /** @return array<string, mixed> */
    private static function canonicalDefaults(): array
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

    /** @return array<string, mixed> */
    private static function withValue(string $path, mixed $value): array
    {
        $input = self::canonicalDefaults();
        $segments = explode('.', $path);
        $cursor = &$input;
        foreach (array_slice($segments, 0, -1) as $segment) {
            $cursor = &$cursor[$segment];
        }
        $cursor[$segments[array_key_last($segments)]] = $value;

        return $input;
    }

    /** @param array<string, mixed> $input */
    private static function unsetPath(array &$input, string $path): void
    {
        $segments = explode('.', $path);
        $cursor = &$input;
        foreach (array_slice($segments, 0, -1) as $segment) {
            $cursor = &$cursor[$segment];
        }
        unset($cursor[$segments[array_key_last($segments)]]);
    }

    /** @return array<int, array{path: string, code: string}> */
    private static function issueIdentity(array $result): array
    {
        self::assertFalse($result['success']);

        return array_map(
            static fn (array $issue): array => ['path' => $issue['path'], 'code' => $issue['code']],
            $result['issues'],
        );
    }
}
