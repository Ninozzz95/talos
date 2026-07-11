<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class TalosSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_workspace_settings_are_user_owned_at_the_schema_boundary(): void
    {
        $this->assertTrue(Schema::hasColumn('talos_workspace_settings', 'user_id'));
    }

    public function test_settings_can_store_and_return_only_safe_preferences(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);
        $contextSet = TalosContextSet::query()->create([
            'user_id' => $this->user->id,
            'name' => 'Default context',
            'status' => 'available',
        ]);

        $response = $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => $profile->id,
            'default_context_set_id' => $contextSet->id,
            'preferences' => [
                'density' => 'compact',
                'api_key' => 'client-secret',
                'private_key' => 'client-private-key',
                'authorization' => 'client-authorization',
                'credential' => 'client-credential',
                'bearer' => 'client-bearer',
                'nested' => [
                    'secret' => 'nested-secret',
                    'private_key' => 'nested-private-key',
                    'credential' => 'nested-credential',
                    'theme' => 'forge',
                ],
                'theme' => 'terminal',
                'ai_defaults' => [
                    'utility_model_mode' => 'same_as_chat',
                    'vision_enabled' => true,
                    'research_model_mode' => 'same_as_chat',
                ],
                'search' => [
                    'provider' => 'searxng',
                    'results_per_query' => 7,
                    'url' => 'http://localhost:8080',
                    'fallbacks' => ['duckduckgo'],
                    'deep_research' => [
                        'max_tokens' => 16384,
                        'extract_timeout' => 90,
                        'extract_parallel' => 3,
                        'timeout' => 1800,
                    ],
                ],
                'agent_tools' => [
                    'tool_call_limit' => 12,
                    'max_steps_per_message' => 24,
                    'enabled_groups' => ['code', 'search', 'documents'],
                ],
                'reminders' => [
                    'channel' => 'browser',
                    'ai_synthesis' => false,
                    'public_app_url' => 'https://talos.example.test',
                ],
                'providers' => [
                    [
                        'name' => 'openai',
                        'encrypted_secret' => 'provider-secret',
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.default_model_profile_id', $profile->id)
            ->assertJsonPath('data.default_context_set_id', $contextSet->id)
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.nested.theme', 'forge')
            ->assertJsonPath('data.preferences.theme', 'terminal')
            ->assertJsonPath('data.preferences.search.provider', 'searxng')
            ->assertJsonPath('data.preferences.search.results_per_query', 7)
            ->assertJsonPath('data.preferences.search.deep_research.max_tokens', 16384)
            ->assertJsonPath('data.preferences.ai_defaults.vision_enabled', true)
            ->assertJsonPath('data.preferences.agent_tools.max_steps_per_message', 24)
            ->assertJsonPath('data.preferences.reminders.channel', 'browser');

        $data = $response->json('data');
        $this->assertArrayNotHasKey('api_key', $data['preferences']);
        $this->assertArrayNotHasKey('private_key', $data['preferences']);
        $this->assertArrayNotHasKey('authorization', $data['preferences']);
        $this->assertArrayNotHasKey('credential', $data['preferences']);
        $this->assertArrayNotHasKey('bearer', $data['preferences']);
        $this->assertArrayNotHasKey('secret', $data['preferences']['nested']);
        $this->assertArrayNotHasKey('private_key', $data['preferences']['nested']);
        $this->assertArrayNotHasKey('credential', $data['preferences']['nested']);
        $this->assertArrayNotHasKey('encrypted_secret', $data['preferences']['providers'][0]);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('compact', $storedPreferences);
        $this->assertStringNotContainsString('client-secret', $storedPreferences);
        $this->assertStringNotContainsString('client-private-key', $storedPreferences);
        $this->assertStringNotContainsString('client-authorization', $storedPreferences);
        $this->assertStringNotContainsString('client-credential', $storedPreferences);
        $this->assertStringNotContainsString('client-bearer', $storedPreferences);
        $this->assertStringNotContainsString('nested-secret', $storedPreferences);
        $this->assertStringNotContainsString('nested-private-key', $storedPreferences);
        $this->assertStringNotContainsString('nested-credential', $storedPreferences);
        $this->assertStringNotContainsString('provider-secret', $storedPreferences);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.default_model_profile_id', $profile->id)
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.theme', 'terminal')
            ->assertJsonPath('data.preferences.search.provider', 'searxng')
            ->assertJsonMissing(['api_key' => 'client-secret'])
            ->assertJsonMissing(['private_key' => 'client-private-key'])
            ->assertJsonMissing(['authorization' => 'client-authorization'])
            ->assertJsonMissing(['credential' => 'client-credential'])
            ->assertJsonMissing(['bearer' => 'client-bearer'])
            ->assertJsonMissing(['secret' => 'nested-secret'])
            ->assertJsonMissing(['private_key' => 'nested-private-key'])
            ->assertJsonMissing(['credential' => 'nested-credential'])
            ->assertJsonMissing(['encrypted_secret' => 'provider-secret']);
    }

    public function test_settings_sanitize_bounded_chat_layout_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'chat_layout' => [
                    'bubble_scale' => 'expanded',
                    'composer_mode' => 'minimal',
                    'advanced_rail_expanded' => true,
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.chat_layout.bubble_scale', 'expanded')
            ->assertJsonPath('data.preferences.chat_layout.composer_mode', 'minimal')
            ->assertJsonPath('data.preferences.chat_layout.advanced_rail_expanded', true);

        $layout = $response->json('data.preferences.chat_layout');
        $this->assertSame([
            'bubble_scale' => 'expanded',
            'composer_mode' => 'minimal',
            'advanced_rail_expanded' => true,
        ], $layout);

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'chat_layout' => [
                    'bubble_scale' => 'giant',
                    'composer_mode' => 'hidden',
                    'advanced_rail_expanded' => 'yes',
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.chat_layout.bubble_scale',
                'preferences.chat_layout.composer_mode',
                'preferences.chat_layout.advanced_rail_expanded',
            ]);
    }

    public function test_theme_policy_lock_blocks_visual_chat_layout_writes_but_not_advanced_disclosure(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme_policy_locked' => true,
                'theme' => 'forge',
                'chat_layout' => [
                    'bubble_scale' => 'balanced',
                    'composer_mode' => 'full',
                    'advanced_rail_expanded' => false,
                ],
            ],
        ]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'chat_layout' => ['bubble_scale' => 'compact'],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_policy_locked' => true,
                'chat_layout' => ['advanced_rail_expanded' => true],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.chat_layout.advanced_rail_expanded', true)
            ->assertJsonPath('data.preferences.chat_layout.bubble_scale', 'balanced')
            ->assertJsonPath('data.preferences.chat_layout.composer_mode', 'full')
            ->assertJsonPath('data.preferences.theme', 'forge')
            ->assertJsonPath('data.preferences.theme_policy_locked', true);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_policy_locked' => false],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');
    }

    public function test_settings_validate_default_references(): void
    {
        $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => 'missing-profile',
            'default_context_set_id' => 'missing-context-set',
            'preferences' => ['density' => 'compact'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['default_model_profile_id', 'default_context_set_id']);
    }

    public function test_settings_reject_default_references_owned_by_another_user(): void
    {
        $otherUser = User::factory()->create();
        $foreignProfile = TalosModelProfile::query()->create([
            'user_id' => $otherUser->id,
            'provider' => 'openai',
            'model' => 'gpt-foreign',
            'display_name' => 'Foreign profile',
            'encrypted_secret' => Crypt::encryptString('foreign-secret'),
            'status' => 'healthy',
        ]);
        $foreignContextSet = TalosContextSet::query()->create([
            'user_id' => $otherUser->id,
            'name' => 'Foreign context',
            'status' => 'available',
        ]);

        $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => $foreignProfile->id,
            'default_context_set_id' => $foreignContextSet->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['default_model_profile_id', 'default_context_set_id'])
            ->assertJsonMissing(['foreign-secret'])
            ->assertJsonMissing(['Foreign context']);
    }

    public function test_settings_are_isolated_per_authenticated_user(): void
    {
        $otherUser = User::factory()->create();
        $ownedProfile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-owned',
            'display_name' => 'Owned profile',
            'encrypted_secret' => Crypt::encryptString('owned-secret'),
            'status' => 'healthy',
        ]);
        $otherProfile = TalosModelProfile::query()->create([
            'user_id' => $otherUser->id,
            'provider' => 'openai',
            'model' => 'gpt-other',
            'display_name' => 'Other profile',
            'encrypted_secret' => Crypt::encryptString('other-secret'),
            'status' => 'healthy',
        ]);

        $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => $ownedProfile->id,
            'preferences' => [
                'theme' => 'terminal',
                'density' => 'compact',
            ],
        ])->assertOk();

        $this->actingAs($otherUser);
        $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => $otherProfile->id,
            'preferences' => [
                'theme' => 'paper',
                'density' => 'comfortable',
            ],
        ])->assertOk();

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.default_model_profile_id', $otherProfile->id)
            ->assertJsonPath('data.preferences.theme', 'paper')
            ->assertJsonPath('data.preferences.density', 'comfortable')
            ->assertJsonMissing(['default_model_profile_id' => $ownedProfile->id])
            ->assertJsonMissing(['theme' => 'terminal']);

        $this->actingAs($this->user);
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.default_model_profile_id', $ownedProfile->id)
            ->assertJsonPath('data.preferences.theme', 'terminal')
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonMissing(['default_model_profile_id' => $otherProfile->id])
            ->assertJsonMissing(['theme' => 'paper']);
    }

    public function test_settings_persist_each_theme_preset_via_settings_api(): void
    {
        $themes = [
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

        foreach ($themes as $theme) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => [
                    'theme' => $theme,
                ],
            ])
                ->assertOk()
                ->assertJsonPath('data.preferences.theme', $theme);

            $storedPreferences = $this->storedPreferencesForCurrentUser();
            $this->assertIsString($storedPreferences);
            $this->assertStringContainsString($theme, $storedPreferences);

            $this->getJson('/api/talos/settings')
                ->assertOk()
                ->assertJsonPath('data.preferences.theme', $theme);
        }
    }

    public function test_settings_persist_safe_theme_mode_separately_from_theme_preset(): void
    {
        foreach (['system', 'light', 'dark'] as $mode) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => [
                    'theme' => 'terminal',
                    'theme_mode' => $mode,
                ],
            ])
                ->assertOk()
                ->assertJsonPath('data.preferences.theme', 'terminal')
                ->assertJsonPath('data.preferences.theme_mode', $mode);

            $storedPreferences = $this->storedPreferencesForCurrentUser();
            $this->assertIsString($storedPreferences);
            $this->assertStringContainsString('"theme":"terminal"', $storedPreferences);
            $this->assertStringContainsString("\"theme_mode\":\"{$mode}\"", $storedPreferences);
        }

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'terminal',
                'theme_mode' => 'solarized-secret',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_mode']);

        $this->assertSame('dark', $this->getJson('/api/talos/settings')->json('data.preferences.theme_mode'));
    }

    public function test_settings_sanitize_theme_engine_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_customization' => [
                    'background' => '#02080c',
                    'panel' => '#08121a',
                    'text' => '#e8fbff',
                    'accent' => ' #31D6C8 ',
                    'secondary' => '#b4f06f',
                    'border' => '#1f3540',
                    'font' => 'mono',
                    'density' => 'compact',
                    'radius' => 'balanced',
                    'effect' => 'signal-mesh',
                    'effect_intensity' => '72',
                    'scrollbar_track' => '#071017',
                    'scrollbar_thumb' => '#31d6c8',
                    'scrollbar_thumb_hover' => '#b4f06f',
                    'scrollbar_width' => 11,
                ],
                'theme_library' => [
                    [
                        'id' => 'operator',
                        'name' => 'Operator',
                        'base_theme' => 'forge',
                        'theme_mode' => 'dark',
                        'tokens' => [
                            'background' => '#02080c',
                            'panel' => '#08121a',
                            'text' => '#e8fbff',
                            'accent' => '#31d6c8',
                        ],
                        'area_tokens' => [
                            'chat' => [
                                'background' => '#041016',
                                'accent' => '#31d6c8',
                            ],
                        ],
                        'motion' => 'subtle',
                        'chat_layout' => [
                            'bubble_scale' => 'expanded',
                            'composer_mode' => 'minimal',
                            'advanced_rail_expanded' => true,
                        ],
                    ],
                ],
                'theme' => 'violet',
                'workspace_default_theme' => 'violet',
                'theme_motion' => 'cinematic',
                'theme_motion_disabled' => true,
                'theme_simple_animation' => false,
                'theme_background_disabled' => false,
                'theme_area_tokens' => [
                    'chat' => [
                        'background' => '#02080c',
                        'surface' => '#08121a',
                        'accent' => '#31d6c8',
                    ],
                    'header' => [
                        'text' => '#e8fbff',
                        'muted' => '#b8cbd0',
                        'border' => '#1f3540',
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_customization.background', '#02080c')
            ->assertJsonPath('data.preferences.theme_customization.effect', 'signal-mesh')
            ->assertJsonPath('data.preferences.theme_customization.scrollbar_track', '#071017')
            ->assertJsonPath('data.preferences.theme_customization.scrollbar_thumb', '#31d6c8')
            ->assertJsonPath('data.preferences.theme_customization.scrollbar_thumb_hover', '#b4f06f')
            ->assertJsonPath('data.preferences.theme_customization.scrollbar_width', 11)
            ->assertJsonPath('data.preferences.theme_library.0.id', 'operator')
            ->assertJsonPath('data.preferences.theme_library.0.name', 'Operator')
            ->assertJsonPath('data.preferences.theme_library.0.base_theme', 'forge')
            ->assertJsonPath('data.preferences.theme_library.0.theme_mode', 'dark')
            ->assertJsonPath('data.preferences.theme_library.0.tokens.background', '#02080c')
            ->assertJsonPath('data.preferences.theme_library.0.area_tokens.chat.accent', '#31d6c8')
            ->assertJsonPath('data.preferences.theme_library.0.motion', 'subtle')
            ->assertJsonPath('data.preferences.theme_library.0.chat_layout.bubble_scale', 'expanded')
            ->assertJsonPath('data.preferences.theme_library.0.chat_layout.composer_mode', 'minimal')
            ->assertJsonPath('data.preferences.theme_library.0.chat_layout.advanced_rail_expanded', true)
            ->assertJsonPath('data.preferences.theme', 'violet')
            ->assertJsonPath('data.preferences.workspace_default_theme', 'violet')
            ->assertJsonPath('data.preferences.theme_motion', 'cinematic')
            ->assertJsonPath('data.preferences.theme_motion_disabled', true)
            ->assertJsonPath('data.preferences.theme_simple_animation', false)
            ->assertJsonPath('data.preferences.theme_background_disabled', false)
            ->assertJsonPath('data.preferences.theme_area_tokens.chat.background', '#02080c')
            ->assertJsonPath('data.preferences.theme_area_tokens.chat.surface', '#08121a')
            ->assertJsonPath('data.preferences.theme_area_tokens.header.text', '#e8fbff')
            ->assertJsonPath('data.preferences.theme_area_tokens.header.muted', '#b8cbd0');

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('operator', $storedPreferences);
    }

    public function test_settings_sanitize_appearance_visibility_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'appearance_visibility' => [
                    'chat_area' => [
                        'session_header' => false,
                        'full_width_chat' => true,
                        'welcome_message' => false,
                        'unknown_chat_control' => true,
                        'api_key' => 'appearance-secret',
                    ],
                    'chat_bar' => [
                        'web_search' => false,
                        'attach_files' => true,
                        'deep_research' => true,
                        'style' => 'display:none',
                    ],
                    'sidebar' => [
                        'brand_name' => true,
                        'compare' => false,
                        'cookbook' => true,
                        'deep_research' => true,
                        'script' => 'alert(1)',
                    ],
                    'unknown_group' => [
                        'compare' => true,
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.appearance_visibility.chat_area.session_header', false)
            ->assertJsonPath('data.preferences.appearance_visibility.chat_area.full_width_chat', true)
            ->assertJsonPath('data.preferences.appearance_visibility.chat_area.welcome_message', false)
            ->assertJsonPath('data.preferences.appearance_visibility.chat_bar.web_search', false)
            ->assertJsonPath('data.preferences.appearance_visibility.chat_bar.attach_files', true)
            ->assertJsonPath('data.preferences.appearance_visibility.sidebar.brand_name', true)
            ->assertJsonPath('data.preferences.appearance_visibility.sidebar.compare', false);

        $preferences = $response->json('data.preferences');
        $this->assertArrayNotHasKey('unknown_chat_control', $preferences['appearance_visibility']['chat_area']);
        $this->assertArrayNotHasKey('api_key', $preferences['appearance_visibility']['chat_area']);
        $this->assertArrayNotHasKey('style', $preferences['appearance_visibility']['chat_bar']);
        $this->assertArrayNotHasKey('script', $preferences['appearance_visibility']['sidebar']);
        $this->assertArrayNotHasKey('unknown_group', $preferences['appearance_visibility']);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringNotContainsString('appearance-secret', $storedPreferences);
        $this->assertStringNotContainsString('display:none', $storedPreferences);
        $this->assertStringNotContainsString('alert(1)', $storedPreferences);
    }

    public function test_settings_sanitize_keyboard_shortcut_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'keyboard_shortcuts' => [
                    'search_conversations' => 'Ctrl+K',
                    'toggle_sidebar' => 'Ctrl+B',
                    'open_compare' => 'Ctrl+Alt+M',
                    'open_cookbook' => '',
                    'duplicate_binding' => 'Ctrl+K',
                    'unknown_action' => 'Ctrl+Alt+U',
                    'favorite_session' => 'Ctrl+Alt+F',
                    'delete_session' => 'Ctrl+Alt+D',
                    'toggle_incognito' => 'Ctrl+Alt+I',
                    'play_stop_tts' => 'Alt+Shift+T',
                    'open_theme' => '<script>alert(1)</script>',
                    'api_key' => 'shortcut-secret',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.keyboard_shortcuts.search_conversations', 'Ctrl+K')
            ->assertJsonPath('data.preferences.keyboard_shortcuts.toggle_sidebar', 'Ctrl+B')
            ->assertJsonPath('data.preferences.keyboard_shortcuts.open_compare', 'Ctrl+Alt+M')
            ->assertJsonPath('data.preferences.keyboard_shortcuts.open_cookbook', '');

        $preferences = $response->json('data.preferences');
        $this->assertArrayNotHasKey('duplicate_binding', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('unknown_action', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('favorite_session', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('delete_session', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('toggle_incognito', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('play_stop_tts', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('open_theme', $preferences['keyboard_shortcuts']);
        $this->assertArrayNotHasKey('api_key', $preferences['keyboard_shortcuts']);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringNotContainsString('shortcut-secret', $storedPreferences);
        $this->assertStringNotContainsString('<script>', $storedPreferences);
    }

    public function test_settings_reject_unsafe_theme_motion_values(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_motion' => 'hyperdrive',
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_motion']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_sanitize_ui_animation_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'ui_animation_profile' => 'custom',
                'ui_animation_customization' => [
                    'open_close' => 'terminal-snap',
                    'surface_transition' => 'axis-shift',
                    'feedback' => 'trace',
                    'hover' => 'node-glow',
                    'duration_scale' => 150,
                    'intensity' => 0,
                    'easing' => 'cinematic',
                    'stagger' => 120,
                ],
                'theme_library' => [
                    [
                        'id' => 'motion-theme',
                        'name' => 'Motion Theme',
                        'base_theme' => 'signal',
                        'tokens' => [
                            'accent' => '#31d6c8',
                        ],
                        'ui_animation_profile' => 'custom',
                        'ui_animation_customization' => [
                            'open_close' => 'depth',
                            'surface_transition' => 'scale-fade',
                            'feedback' => 'pulse',
                            'hover' => 'edge-glow',
                            'duration_scale' => 75,
                            'intensity' => 88,
                            'easing' => 'soft',
                            'stagger' => 22,
                        ],
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.ui_animation_profile', 'custom')
            ->assertJsonPath('data.preferences.ui_animation_customization.open_close', 'terminal-snap')
            ->assertJsonPath('data.preferences.ui_animation_customization.surface_transition', 'axis-shift')
            ->assertJsonPath('data.preferences.ui_animation_customization.feedback', 'trace')
            ->assertJsonPath('data.preferences.ui_animation_customization.hover', 'node-glow')
            ->assertJsonPath('data.preferences.ui_animation_customization.duration_scale', 150)
            ->assertJsonPath('data.preferences.ui_animation_customization.intensity', 0)
            ->assertJsonPath('data.preferences.ui_animation_customization.easing', 'cinematic')
            ->assertJsonPath('data.preferences.ui_animation_customization.stagger', 120)
            ->assertJsonPath('data.preferences.theme_library.0.ui_animation_profile', 'custom')
            ->assertJsonPath('data.preferences.theme_library.0.ui_animation_customization.open_close', 'depth')
            ->assertJsonPath('data.preferences.theme_library.0.ui_animation_customization.duration_scale', 75)
            ->assertJsonPath('data.preferences.theme_library.0.ui_animation_customization.intensity', 88)
            ->assertJsonPath('data.preferences.theme_library.0.ui_animation_customization.stagger', 22);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('terminal-snap', $storedPreferences);
    }

    public function test_settings_rejects_invalid_theme_writes_atomically(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme' => 'forge',
                'theme_customization' => ['accent' => '#112233'],
            ],
        ]);

        $before = $this->storedPreferencesForCurrentUser();

        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'theme' => 'terminal',
                'theme_customization' => [
                    'accent' => 'rgb(1, 2, 3)',
                    'font' => 'comic',
                    'density' => 'dense',
                    'radius' => 'round',
                    'effect' => 'video',
                    'effect_intensity' => 101,
                    'unknown' => '#ffffff',
                ],
                'theme_motion' => 'hyperdrive',
                'theme_mode' => 'solarized',
                'theme_area_tokens' => [
                    'sidebar' => [
                        'accent' => '#ffffff',
                        'unknown' => '#ffffff',
                    ],
                    'admin' => ['background' => '#ffffff'],
                ],
                'ui_animation_profile' => 'hyperdrive',
                'ui_animation_customization' => [
                    'open_close' => 'spring',
                    'duration_scale' => 151,
                    'intensity' => -1,
                    'stagger' => 121,
                ],
                'theme_unknown' => true,
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.theme_customization.accent',
                'preferences.theme_customization.font',
                'preferences.theme_customization.density',
                'preferences.theme_customization.radius',
                'preferences.theme_customization.effect',
                'preferences.theme_customization.effect_intensity',
                'preferences.theme_customization.unknown',
                'preferences.theme_motion',
                'preferences.theme_mode',
                'preferences.theme_area_tokens.sidebar.unknown',
                'preferences.theme_area_tokens.admin',
                'preferences.ui_animation_profile',
                'preferences.ui_animation_customization.open_close',
                'preferences.ui_animation_customization.duration_scale',
                'preferences.ui_animation_customization.intensity',
                'preferences.ui_animation_customization.stagger',
                'preferences.theme_unknown',
            ]);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_settings_read_sanitizes_invalid_legacy_theme_values(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'compact',
                'theme' => 'forge',
                'theme_customization' => [
                    'accent' => 'not-a-color',
                    'panel' => '#112233',
                    'font' => 'unknown-font',
                ],
                'theme_area_tokens' => [
                    'chat' => [
                        'accent' => '#445566',
                        'text' => 'transparent',
                    ],
                    'unknown' => ['accent' => '#ffffff'],
                ],
                'ui_animation_customization' => [
                    'intensity' => 101,
                    'easing' => 'precise',
                ],
                'theme_unknown' => 'legacy-value',
            ],
        ]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.theme', 'forge')
            ->assertJsonPath('data.preferences.theme_customization.panel', '#112233')
            ->assertJsonPath('data.preferences.theme_area_tokens.chat.accent', '#445566')
            ->assertJsonPath('data.preferences.ui_animation_customization.easing', 'precise')
            ->assertJsonMissingPath('data.preferences.theme_customization.accent')
            ->assertJsonMissingPath('data.preferences.theme_customization.font')
            ->assertJsonMissingPath('data.preferences.theme_area_tokens.chat.text')
            ->assertJsonMissingPath('data.preferences.theme_area_tokens.unknown')
            ->assertJsonMissingPath('data.preferences.ui_animation_customization.intensity')
            ->assertJsonMissingPath('data.preferences.theme_unknown');
    }

    public function test_settings_read_normalizes_legacy_light_and_dark_theme_ids(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'dark',
                'workspace_default_theme' => 'light',
                'theme_library' => [[
                    'id' => 'legacy-dark-theme',
                    'name' => 'Legacy Dark Theme',
                    'base_theme' => 'dark',
                    'tokens' => [],
                ]],
            ],
        ]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'forge')
            ->assertJsonPath('data.preferences.workspace_default_theme', 'paper')
            ->assertJsonPath('data.preferences.theme_library.0.base_theme', 'forge');
    }

    public function test_named_theme_writes_require_complete_records_atomically(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme_library' => [$this->namedThemeRecord('existing-theme')],
            ],
        ]);

        $missingId = $this->namedThemeRecord('missing-id');
        $missingName = $this->namedThemeRecord('missing-name');
        $missingBaseTheme = $this->namedThemeRecord('missing-base-theme');
        $missingTokens = $this->namedThemeRecord('missing-tokens');
        unset($missingId['id'], $missingName['name'], $missingBaseTheme['base_theme'], $missingTokens['tokens']);

        $before = $this->storedPreferencesForCurrentUser();

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'theme_library' => [$missingId, $missingName, $missingBaseTheme, $missingTokens],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.theme_library.0.id',
                'preferences.theme_library.1.name',
                'preferences.theme_library.2.base_theme',
                'preferences.theme_library.3.tokens',
            ]);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_active_custom_theme_id_resolves_against_the_effective_library_atomically(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme_library' => [$this->namedThemeRecord('persisted-theme')],
            ],
        ]);

        $before = $this->storedPreferencesForCurrentUser();

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'active_custom_theme_id' => 'missing-theme',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.active_custom_theme_id']);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [$this->namedThemeRecord('submitted-theme')],
                'active_custom_theme_id' => 'persisted-theme',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.active_custom_theme_id']);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'active_custom_theme_id' => 'persisted-theme',
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.active_custom_theme_id', 'persisted-theme')
            ->assertJsonPath('data.preferences.theme_library.0.id', 'persisted-theme');
    }

    public function test_valid_partial_preference_patch_merges_over_all_stored_preferences(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme_mode' => 'dark',
                'theme_library' => [$this->namedThemeRecord('merge-theme')],
                'theme_customization' => [
                    'accent' => '#112233',
                    'radius' => 'soft',
                ],
                'search' => [
                    'provider' => 'searxng',
                    'results_per_query' => 7,
                ],
                'agent_tools' => [
                    'tool_call_limit' => 12,
                ],
            ],
        ]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'theme_library' => [$this->namedThemeRecord('replacement-theme')],
                'theme_customization' => ['accent' => '#aabbcc'],
                'search' => ['results_per_query' => 12],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.theme_mode', 'dark')
            ->assertJsonCount(1, 'data.preferences.theme_library')
            ->assertJsonPath('data.preferences.theme_library.0.id', 'replacement-theme')
            ->assertJsonPath('data.preferences.theme_customization.accent', '#aabbcc')
            ->assertJsonPath('data.preferences.theme_customization.radius', 'soft')
            ->assertJsonPath('data.preferences.search.provider', 'searxng')
            ->assertJsonPath('data.preferences.search.results_per_query', 12)
            ->assertJsonPath('data.preferences.agent_tools.tool_call_limit', 12);
    }

    public function test_omitted_preferences_and_empty_root_values_are_no_ops(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme_mode' => 'dark',
                'search' => ['provider' => 'searxng'],
                'active_custom_theme_id' => 'legacy-missing-theme',
            ],
        ]);

        $before = $this->storedPreferencesForCurrentUser();

        $this->patchJson('/api/talos/settings', [])
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'comfortable')
            ->assertJsonPath('data.preferences.theme_mode', 'dark');
        $this->assertSame($before, $this->storedPreferencesForCurrentUser());

        foreach ([(object) [], []] as $emptyRoot) {
            $this->patchJson('/api/talos/settings', ['preferences' => $emptyRoot])
                ->assertOk()
                ->assertJsonPath('data.preferences.density', 'comfortable')
                ->assertJsonPath('data.preferences.theme_mode', 'dark')
                ->assertJsonPath('data.preferences.search.provider', 'searxng');

            $this->assertSame($before, $this->storedPreferencesForCurrentUser());
        }
    }

    public function test_null_preferences_clear_all_stored_preferences(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'theme_mode' => 'dark',
                'search' => ['provider' => 'searxng'],
            ],
        ]);

        $this->patchJson('/api/talos/settings', ['preferences' => null])
            ->assertOk()
            ->assertJsonPath('data.preferences', []);

        $this->assertSame([], json_decode((string) $this->storedPreferencesForCurrentUser(), true));
    }

    public function test_explicit_empty_theme_values_and_null_active_id_clear_stored_settings(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'comfortable',
                'search' => ['provider' => 'searxng'],
                'theme_library' => [$this->namedThemeRecord('clear-theme')],
                'active_custom_theme_id' => 'clear-theme',
                'theme_customization' => ['accent' => '#112233'],
                'theme_area_tokens' => ['chat' => ['accent' => '#445566']],
                'ui_animation_customization' => ['intensity' => 50],
                'chat_layout' => [
                    'bubble_scale' => 'expanded',
                    'composer_mode' => 'minimal',
                ],
            ],
        ]);

        $before = $this->storedPreferencesForCurrentUser();
        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_library' => []],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.active_custom_theme_id']);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());

        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [],
                'active_custom_theme_id' => null,
                'theme_customization' => (object) [],
                'theme_area_tokens' => (object) [],
                'ui_animation_customization' => [],
                'chat_layout' => (object) [],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'comfortable')
            ->assertJsonPath('data.preferences.search.provider', 'searxng')
            ->assertJsonPath('data.preferences.theme_library', [])
            ->assertJsonPath('data.preferences.active_custom_theme_id', null)
            ->assertJsonPath('data.preferences.theme_customization', [])
            ->assertJsonPath('data.preferences.theme_area_tokens', [])
            ->assertJsonPath('data.preferences.ui_animation_customization', [])
            ->assertJsonPath('data.preferences.chat_layout', []);

        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true);
        $this->assertIsArray($stored);
        foreach (['theme_library', 'theme_customization', 'theme_area_tokens', 'ui_animation_customization', 'chat_layout'] as $key) {
            $this->assertSame([], $stored[$key] ?? null);
        }
        $this->assertArrayHasKey('active_custom_theme_id', $stored);
        $this->assertNull($stored['active_custom_theme_id']);
    }

    public function test_named_theme_library_write_is_capped_at_fifty_records(): void
    {
        $library = [];
        for ($index = 1; $index <= 51; $index++) {
            $library[] = $this->namedThemeRecord("theme-{$index}");
        }

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_library' => $library],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_library']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_named_theme_timestamps_are_bounded_and_iso_8601_parseable(): void
    {
        $theme = $this->namedThemeRecord('timestamp-theme', [
            'created_at' => str_repeat('2', 65),
            'updated_at' => '2026-02-30T12:00:00Z',
        ]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_library' => [$theme]],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.theme_library.0.created_at',
                'preferences.theme_library.0.updated_at',
            ]);

        $this->assertNull($this->storedPreferencesForCurrentUser());

        $validTimestamp = '2026-07-08T12:00:00.000Z';
        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [$this->namedThemeRecord('timestamp-theme', [
                    'created_at' => $validTimestamp,
                    'updated_at' => $validTimestamp,
                ])],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_library.0.created_at', $validTimestamp)
            ->assertJsonPath('data.preferences.theme_library.0.updated_at', $validTimestamp);
    }

    public function test_named_theme_timestamp_timezone_ranges_are_strict(): void
    {
        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [$this->namedThemeRecord('invalid-offset-theme', [
                    'created_at' => '2026-07-08T12:00:00+24:00',
                    'updated_at' => '2026-07-08T12:00:00-23:60',
                ])],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.theme_library.0.created_at',
                'preferences.theme_library.0.updated_at',
            ]);

        $this->assertNull($this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [$this->namedThemeRecord('valid-offset-theme', [
                    'created_at' => '2026-07-08T12:00:00+23:59',
                    'updated_at' => '2026-07-08T12:00:00-23:59',
                ])],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_library.0.created_at', '2026-07-08T12:00:00+23:59')
            ->assertJsonPath('data.preferences.theme_library.0.updated_at', '2026-07-08T12:00:00-23:59');
    }

    public function test_integer_theme_fields_reject_fractional_values_and_accept_integer_strings(): void
    {
        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_customization' => [
                    'effect_intensity' => 72.5,
                    'scrollbar_width' => '11.5',
                ],
                'ui_animation_customization' => [
                    'duration_scale' => '100.0',
                    'intensity' => 42.25,
                    'stagger' => '1e1',
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.theme_customization.effect_intensity',
                'preferences.theme_customization.scrollbar_width',
                'preferences.ui_animation_customization.duration_scale',
                'preferences.ui_animation_customization.intensity',
                'preferences.ui_animation_customization.stagger',
            ]);

        $this->assertNull($this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_customization' => [
                    'effect_intensity' => '072',
                    'scrollbar_width' => '11',
                ],
                'ui_animation_customization' => [
                    'duration_scale' => '125',
                    'intensity' => '86',
                    'stagger' => '64',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_customization.effect_intensity', 72)
            ->assertJsonPath('data.preferences.theme_customization.scrollbar_width', 11)
            ->assertJsonPath('data.preferences.ui_animation_customization.duration_scale', 125)
            ->assertJsonPath('data.preferences.ui_animation_customization.intensity', 86)
            ->assertJsonPath('data.preferences.ui_animation_customization.stagger', 64);
    }

    public function test_legacy_theme_library_read_drops_malformed_and_duplicate_records_and_caps_fifty(): void
    {
        $partial = $this->namedThemeRecord('partial-theme');
        unset($partial['tokens']);

        $library = [
            $this->namedThemeRecord('keep-1'),
            $partial,
            $this->namedThemeRecord('malformed-theme', ['updated_at' => 'not-a-timestamp']),
            $this->namedThemeRecord('keep-1', ['name' => 'Duplicate']),
        ];
        for ($index = 2; $index <= 60; $index++) {
            $library[] = $this->namedThemeRecord("keep-{$index}");
        }

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['theme_library' => $library],
        ]);

        $response = $this->getJson('/api/talos/settings')->assertOk();
        $sanitizedLibrary = $response->json('data.preferences.theme_library');

        $this->assertIsArray($sanitizedLibrary);
        $this->assertCount(50, $sanitizedLibrary);
        $this->assertSame('keep-1', $sanitizedLibrary[0]['id']);
        $this->assertSame('keep-50', $sanitizedLibrary[49]['id']);
        $this->assertNotContains('partial-theme', array_column($sanitizedLibrary, 'id'));
        $this->assertNotContains('malformed-theme', array_column($sanitizedLibrary, 'id'));
        $this->assertSame(1, count(array_filter(
            array_column($sanitizedLibrary, 'id'),
            static fn (string $id): bool => $id === 'keep-1',
        )));
    }

    public function test_settings_reject_unsafe_ui_animation_values(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'ui_animation_profile' => 'hyperdrive',
                'ui_animation_customization' => [
                    'open_close' => 'spring-loaded',
                    'surface_transition' => 'spin',
                    'feedback' => 'shake-forever',
                    'hover' => 'grow-layout',
                    'duration_scale' => 'not-a-number',
                    'intensity' => 'huge',
                    'easing' => 'random',
                    'stagger' => [],
                ],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.ui_animation_profile',
                'preferences.ui_animation_customization.open_close',
                'preferences.ui_animation_customization.surface_transition',
                'preferences.ui_animation_customization.feedback',
                'preferences.ui_animation_customization.hover',
                'preferences.ui_animation_customization.duration_scale',
                'preferences.ui_animation_customization.intensity',
                'preferences.ui_animation_customization.easing',
                'preferences.ui_animation_customization.stagger',
            ]);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_reject_low_contrast_theme_customization_before_persistence(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'forge',
                'theme_customization' => [
                    'background' => '#111111',
                    'panel' => '#111111',
                    'text' => '#121212',
                ],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_customization']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_reject_a_customization_that_makes_existing_area_tokens_unreadable(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'forge',
                'theme_customization' => [
                    'background' => '#ffffff',
                    'panel' => '#ffffff',
                    'text' => '#111827',
                ],
                'theme_area_tokens' => [
                    'composer' => [
                        'background' => '#ffffff',
                        'surface' => '#ffffff',
                    ],
                ],
            ],
        ]);
        $before = $this->storedPreferencesForCurrentUser();

        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_customization' => [
                    'background' => '#111827',
                    'panel' => '#1f2937',
                    'text' => '#f9fafb',
                ],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_area_tokens.composer']);

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_settings_reject_low_contrast_area_tokens_in_named_themes(): void
    {
        $unsafeTheme = $this->namedThemeRecord('unsafe-area-theme', [
            'base_theme' => 'paper',
            'area_tokens' => [
                'composer' => [
                    'background' => '#000000',
                    'surface' => '#000000',
                    'text' => '#111111',
                    'muted' => '#222222',
                ],
            ],
        ]);

        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_library' => [$unsafeTheme],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_library.0.area_tokens.composer']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_persist_every_client_supported_theme_font_without_silent_loss(): void
    {
        foreach (['manrope', 'serif'] as $font) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => [
                    'theme_customization' => ['font' => $font],
                    'theme_library' => [
                        $this->namedThemeRecord("{$font}-theme", [
                            'tokens' => ['font' => $font],
                        ]),
                    ],
                ],
            ])
                ->assertOk()
                ->assertJsonPath('data.preferences.theme_customization.font', $font)
                ->assertJsonPath('data.preferences.theme_library.0.tokens.font', $font);
        }
    }

    public function test_settings_reject_button_text_that_fails_on_transparent_variants(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'paper',
                'theme_area_tokens' => [
                    'button' => [
                        'background' => '#000000',
                        'surface' => '#000000',
                        'text' => '#ffffff',
                        'muted' => '#cccccc',
                    ],
                ],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_area_tokens.button']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_reject_cross_area_transparent_button_contrast(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'forge',
                'theme_customization' => [
                    'background' => '#000000',
                    'panel' => '#000000',
                    'text' => '#ffffff',
                ],
                'theme_area_tokens' => [
                    'window' => [
                        'background' => '#ffffff',
                        'surface' => '#ffffff',
                        'text' => '#000000',
                        'muted' => '#333333',
                    ],
                    'button' => [
                        'background' => '#000000',
                        'surface' => '#000000',
                        'text' => '#ffffff',
                        'muted' => '#cccccc',
                    ],
                ],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_area_tokens.button']);

        $this->assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_settings_accept_partial_button_override_with_panel_derived_background(): void
    {
        $darkArea = [
            'background' => '#000000',
            'surface' => '#000000',
            'text' => '#ffffff',
            'muted' => '#cccccc',
        ];

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'forge',
                'theme_customization' => [
                    'background' => '#000000',
                    'panel' => '#000000',
                    'text' => '#ffffff',
                ],
                'theme_area_tokens' => [
                    'sidebar' => $darkArea,
                    'chat' => $darkArea,
                    'composer' => $darkArea,
                    'window' => $darkArea,
                    'header' => $darkArea,
                    'card' => $darkArea,
                    'button' => [
                        'surface' => '#000000',
                        'text' => '#ffffff',
                        'muted' => '#cccccc',
                    ],
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_area_tokens.button.background', null)
            ->assertJsonPath('data.preferences.theme_area_tokens.button.surface', '#000000');
    }

    public function test_theme_policy_lock_blocks_theme_writes(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'forge',
                'theme_policy_locked' => true,
            ],
        ]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'terminal',
                'theme_customization' => [
                    'accent' => '#31d6c8',
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_motion_disabled' => true,
                'theme_background_disabled' => true,
                'ui_animation_profile' => 'custom',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'forge')
            ->assertJsonPath('data.preferences.theme_policy_locked', true);
    }

    public function test_theme_policy_lock_allows_empty_root_noop_and_blocks_null_clear(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'forge',
                'theme_policy_locked' => true,
                'density' => 'comfortable',
            ],
        ]);

        $before = $this->storedPreferencesForCurrentUser();

        $this->patchJson('/api/talos/settings', ['preferences' => (object) []])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'forge')
            ->assertJsonPath('data.preferences.theme_policy_locked', true)
            ->assertJsonPath('data.preferences.density', 'comfortable');
        $this->assertSame($before, $this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', ['preferences' => null])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    private function storedPreferencesForCurrentUser(): ?string
    {
        return DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->value('preferences');
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function namedThemeRecord(string $id, array $overrides = []): array
    {
        return array_replace([
            'id' => $id,
            'name' => ucwords(str_replace('-', ' ', $id)),
            'base_theme' => 'forge',
            'tokens' => [],
        ], $overrides);
    }
}
