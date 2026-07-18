<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\TalosThemeMotionV6Migration;
use App\Support\TalosThemeMotionV6;
use PHPUnit\Framework\TestCase;

final class TalosThemeMotionV6MigrationTest extends TestCase
{
    public function test_shared_fixture_matches_the_typescript_contract(): void
    {
        $fixture = json_decode(
            file_get_contents(__DIR__.'/../fixtures/talos-theme-motion-v6-migration-v1.json'),
            false,
            32,
            JSON_THROW_ON_ERROR,
        );

        foreach ($fixture->cases as $case) {
            $expected = json_decode(json_encode($case->expected ?? null, JSON_THROW_ON_ERROR), true, 32, JSON_THROW_ON_ERROR);
            $expectedIssues = json_decode(json_encode($case->expectedIssues ?? null, JSON_THROW_ON_ERROR), true, 32, JSON_THROW_ON_ERROR);
            $result = TalosThemeMotionV6Migration::resolve($case->input);

            if ($expectedIssues !== null) {
                self::assertFalse($result['success'], $case->name);
                $actualIssues = array_map(
                    static fn (array $issue): array => ['path' => $issue['path'], 'code' => $issue['code']],
                    $result['issues'],
                );
                self::assertSame($expectedIssues, $actualIssues, $case->name);
                continue;
            }

            self::assertSame($expected, $result, $case->name);
            self::assertTrue(TalosThemeMotionV6::parse($result['value'])['success'], $case->name);
        }
    }

    public function test_first_save_delta_contains_only_theme_motion_v6(): void
    {
        $resolved = TalosThemeMotionV6Migration::resolve(['theme_motion' => 'subtle']);
        self::assertTrue($resolved['success']);

        self::assertSame(
            ['theme_motion_v6' => $resolved['value']],
            TalosThemeMotionV6Migration::firstSaveDelta($resolved['value']),
        );
    }

    public function test_empty_php_preferences_array_uses_safe_background_off_defaults(): void
    {
        $result = TalosThemeMotionV6Migration::resolve([]);

        self::assertTrue($result['success']);
        self::assertSame('default', $result['source']);
        self::assertSame(TalosThemeMotionV6::defaults(), $result['value']);
        self::assertSame('off', $result['value']['mode']);
        self::assertTrue($result['value']['interface_enabled']);
    }

    public function test_explicit_saved_static_motion_is_preserved_after_default_change(): void
    {
        $saved = TalosThemeMotionV6::defaults();
        $saved['mode'] = 'static';

        $result = TalosThemeMotionV6Migration::resolve(['theme_motion_v6' => $saved]);

        self::assertTrue($result['success']);
        self::assertSame('v6', $result['source']);
        self::assertSame($saved, $result['value']);
    }

    public function test_output_is_independent_and_plain_stdclass_input_is_supported(): void
    {
        $input = json_decode('{"theme_motion":"normal","ui_animation_customization":{"duration_scale":125}}', false, 32, JSON_THROW_ON_ERROR);
        $result = TalosThemeMotionV6Migration::resolve($input);
        self::assertTrue($result['success']);

        $copy = $result['value'];
        $copy['interface']['categories']['windows'] = false;
        self::assertTrue($result['value']['interface']['categories']['windows']);
    }

    public function test_integral_float_ui_values_are_canonicalized_to_ints(): void
    {
        $result = TalosThemeMotionV6Migration::resolve([
            'ui_animation_customization' => [
                'duration_scale' => 125.0,
                'intensity' => 20.0,
                'stagger' => 80.0,
            ],
        ]);

        self::assertTrue($result['success']);
        self::assertSame(125, $result['value']['interface']['duration_scale']);
        self::assertSame(20, $result['value']['interface']['intensity']);
        self::assertSame(80, $result['value']['interface']['stagger']);
    }

    public function test_hostile_php_objects_fail_closed_without_magic_execution(): void
    {
        $subclass = new class extends \stdClass {
            public mixed $theme_motion = 'cinematic';
        };

        $result = TalosThemeMotionV6Migration::resolve($subclass);
        self::assertFalse($result['success']);
        self::assertSame('uninspectable_object', $result['issues'][0]['code']);
    }

    public function test_hostile_nested_ui_customization_fails_typed(): void
    {
        $hostile = new class implements \JsonSerializable {
            public function jsonSerialize(): mixed
            {
                throw new \RuntimeException('must not execute');
            }
        };

        $result = TalosThemeMotionV6Migration::resolve([
            'ui_animation_customization' => $hostile,
        ]);

        self::assertFalse($result['success']);
        self::assertSame('ui_animation_customization', $result['issues'][0]['path']);
        self::assertSame('uninspectable_object', $result['issues'][0]['code']);
    }

    public function test_v6_inspection_is_bounded(): void
    {
        $oversized = [];
        for ($index = 0; $index < 300; $index++) {
            $oversized['x'.$index] = $index;
        }

        $result = TalosThemeMotionV6Migration::resolve(['theme_motion_v6' => $oversized]);

        self::assertFalse($result['success']);
        self::assertSame('theme_motion_v6', $result['issues'][0]['path']);
    }

    public function test_nested_magic_proxy_like_objects_fail_without_invocation(): void
    {
        $hostile = new class {
            public int $calls = 0;

            public function __get(string $name): mixed
            {
                $this->calls++;
                throw new \RuntimeException('must not execute');
            }
        };

        $result = TalosThemeMotionV6Migration::resolve([
            'ui_animation_customization' => $hostile,
        ]);

        self::assertFalse($result['success']);
        self::assertSame(0, $hostile->calls);
        self::assertSame('ui_animation_customization', $result['issues'][0]['path']);
    }

    public function test_unknown_customization_keys_are_ignored(): void
    {
        $result = TalosThemeMotionV6Migration::resolve([
            'ui_animation_customization' => [
                'duration_scale' => 125,
                'open_close' => 'terminal-snap',
            ],
        ]);

        self::assertTrue($result['success']);
        self::assertSame(125, $result['value']['interface']['duration_scale']);
    }

    public function test_v6_cycles_are_rejected_before_unbounded_recursion(): void
    {
        $cycle = new \stdClass;
        $cycle->self = $cycle;

        $result = TalosThemeMotionV6Migration::resolve(['theme_motion_v6' => $cycle]);

        self::assertFalse($result['success']);
        self::assertSame('theme_motion_v6.self', $result['issues'][0]['path']);
        self::assertSame('uninspectable_object', $result['issues'][0]['code']);
    }

    public function test_v6_sparse_and_non_dense_lists_fail_closed(): void
    {
        $sparse = [1 => 'value'];
        $result = TalosThemeMotionV6Migration::resolve([
            'theme_motion_v6' => ['interface' => $sparse],
        ]);

        self::assertFalse($result['success']);
        self::assertSame('theme_motion_v6.interface.1', $result['issues'][0]['path']);
    }

    public function test_dense_array_threshold_counts_elements_not_length_metadata(): void
    {
        $defaults = TalosThemeMotionV6::defaults();
        $defaults['interface'] = range(0, 63);
        $sixtyFour = TalosThemeMotionV6Migration::resolve([
            'theme_motion_v6' => $defaults,
        ]);
        self::assertFalse($sixtyFour['success']);
        self::assertSame('theme_motion_v6.interface', $sixtyFour['issues'][0]['path']);
        self::assertSame('invalid_type', $sixtyFour['issues'][0]['code']);

        $defaults['interface'] = range(0, 64);
        $sixtyFive = TalosThemeMotionV6Migration::resolve(['theme_motion_v6' => $defaults]);
        self::assertFalse($sixtyFive['success']);
        self::assertSame('theme_motion_v6.interface', $sixtyFive['issues'][0]['path']);
        self::assertSame('uninspectable_object', $sixtyFive['issues'][0]['code']);
    }

    public function test_rejects_a_representable_non_finite_v6_number_without_legacy_fallback(): void
    {
        $invalid = \App\Support\TalosThemeMotionV6::defaults();
        $invalid['speed'] = INF;

        $result = TalosThemeMotionV6Migration::resolve([
            'theme_motion_v6' => $invalid,
            'theme_motion' => 'cinematic',
        ]);

        self::assertFalse($result['success']);
        self::assertContains(
            ['path' => 'theme_motion_v6.speed', 'code' => 'not_finite'],
            array_map(
                static fn (array $issue): array => ['path' => $issue['path'], 'code' => $issue['code']],
                $result['issues'],
            ),
        );
    }
}
