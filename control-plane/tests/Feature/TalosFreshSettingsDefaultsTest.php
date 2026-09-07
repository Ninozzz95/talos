<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosWorkspaceSetting;
use App\Support\TalosThemeMotionV6;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosFreshSettingsDefaultsTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_preferences_are_calm_background_off_interface_motion_on_and_full_size_defaults(): void
    {
        $expectedMotion = TalosThemeMotionV6::defaults();
        $expectedMotion['mode'] = 'off';
        $expectedMotion['background_enabled'] = false;
        $expectedMotion['interface_enabled'] = true;

        self::assertSame([
            'theme' => 'calm',
            'theme_motion_v6' => $expectedMotion,
            'ui_scale' => 1.0,
            'prompt_cache' => [
                'mode' => 'automatic',
                'ttl' => null,
            ],
            'chat_layout' => [
                'message_scale' => 1.0,
                'composer_mode' => 'full',
                'message_style' => 'sections',
                'advanced_rail_expanded' => false,
                'mobile_window_presentation' => 'drawer',
            ],
        ], TalosWorkspaceSetting::freshPreferences());
    }

    public function test_settings_get_creates_fresh_defaults_only_when_the_user_has_no_settings_record(): void
    {
        $user = $this->authenticateTalosUser();

        $this->assertDatabaseMissing('talos_workspace_settings', ['user_id' => $user->id]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'calm')
            ->assertJsonPath('data.preferences.theme_motion_v6.mode', 'off')
            ->assertJsonPath('data.preferences.theme_motion_v6.background_enabled', false)
            ->assertJsonPath('data.preferences.theme_motion_v6.interface_enabled', true)
            ->assertJsonPath('data.preferences.ui_scale', 1)
            ->assertJsonPath('data.preferences.chat_layout.message_scale', 1)
            ->assertJsonPath('data.preferences.chat_layout.composer_mode', 'full');

        $stored = TalosWorkspaceSetting::query()
            ->where('user_id', $user->id)
            ->firstOrFail()
            ->preferences;

        self::assertSame('calm', $stored['theme']);
        self::assertFalse($stored['theme_motion_v6']['background_enabled']);
        self::assertTrue($stored['theme_motion_v6']['interface_enabled']);
    }

    public function test_existing_telemetry_and_explicitly_empty_rows_are_never_backfilled(): void
    {
        $telemetryUser = $this->authenticateTalosUser();
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($telemetryUser->id),
            'user_id' => $telemetryUser->id,
            'preferences' => [
                'theme' => 'telemetry',
                'density' => 'compact',
            ],
        ]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'telemetry')
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonMissingPath('data.preferences.ui_scale')
            ->assertJsonMissingPath('data.preferences.theme_motion_v6');

        $emptyUser = $this->authenticateTalosUser();
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($emptyUser->id),
            'user_id' => $emptyUser->id,
            'preferences' => [],
        ]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences', []);

        self::assertSame(
            [],
            TalosWorkspaceSetting::query()->where('user_id', $emptyUser->id)->firstOrFail()->preferences,
        );
    }

    public function test_empty_patch_remains_a_storage_no_op_but_first_real_patch_merges_fresh_defaults(): void
    {
        $user = $this->authenticateTalosUser();

        $this->patchJson('/api/talos/settings', [])
            ->assertOk()
            ->assertJsonPath('data.preferences', []);
        $this->assertDatabaseMissing('talos_workspace_settings', ['user_id' => $user->id]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['density' => 'compact'],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'calm')
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.ui_scale', 1)
            ->assertJsonPath('data.preferences.chat_layout.message_scale', 1);
    }

    public function test_legacy_bubble_scale_maps_without_get_write_and_canonicalizes_on_the_next_real_write(): void
    {
        $user = $this->authenticateTalosUser();
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($user->id),
            'user_id' => $user->id,
            'preferences' => [
                'theme' => 'telemetry',
                'chat_layout' => [
                    'bubble_scale' => 'compact',
                    'composer_mode' => 'minimal',
                ],
            ],
        ]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.chat_layout.message_scale', 0.875)
            ->assertJsonMissingPath('data.preferences.chat_layout.bubble_scale');

        $storedBeforeWrite = TalosWorkspaceSetting::query()
            ->where('user_id', $user->id)
            ->firstOrFail()
            ->getRawOriginal('preferences');
        self::assertIsString($storedBeforeWrite);
        self::assertStringContainsString('"bubble_scale":"compact"', $storedBeforeWrite);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['density' => 'compact'],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.chat_layout.message_scale', 0.9)
            ->assertJsonMissingPath('data.preferences.chat_layout.bubble_scale');

        $storedAfterWrite = TalosWorkspaceSetting::query()
            ->where('user_id', $user->id)
            ->firstOrFail()
            ->preferences;
        self::assertSame(0.9, $storedAfterWrite['chat_layout']['message_scale']);
        self::assertArrayNotHasKey('bubble_scale', $storedAfterWrite['chat_layout']);
    }
}
