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
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'terminal');

        $this->assertArrayNotHasKey('theme_mode', $this->getJson('/api/talos/settings')->json('data.preferences'));
    }

    public function test_settings_sanitize_theme_engine_preferences(): void
    {
        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme_customization' => [
                    'background' => '#02080c',
                    'panel' => '#08121a',
                    'text' => '#e8fbff',
                    'accent' => '#31d6c8',
                    'secondary' => '#b4f06f',
                    'border' => '#1f3540',
                    'font' => 'mono',
                    'density' => 'compact',
                    'radius' => 'balanced',
                    'effect' => 'signal-mesh',
                    'effect_intensity' => 72,
                    'scrollbar_track' => '#071017',
                    'scrollbar_thumb' => '#31d6c8',
                    'scrollbar_thumb_hover' => '#b4f06f',
                    'scrollbar_width' => 11,
                    'api_key' => 'theme-secret',
                    'style' => 'body { display: none; }',
                    'script' => 'alert(1)',
                    'background_url' => 'javascript:alert(1)',
                    'nested' => [
                        'accent' => '#ffffff',
                        'password' => 'nested-theme-secret',
                    ],
                ],
                'theme_library' => [
                    [
                        'id' => 'operator',
                        'name' => 'Operator',
                        'base_theme' => 'forge',
                        'theme_mode' => 'dark',
                        'tokens' => [
                            'background' => '#02080c',
                            'accent' => '#31d6c8',
                            'style' => 'display:none',
                        ],
                        'area_tokens' => [
                            'chat' => [
                                'background' => '#041016',
                                'accent' => '#31d6c8',
                                'script' => 'alert(1)',
                            ],
                            'unknown' => [
                                'background' => '#ffffff',
                            ],
                        ],
                        'motion' => 'subtle',
                        'script' => 'alert(1)',
                        'style' => '.x{}',
                        'api_key' => 'library-secret',
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
                        'panel' => '#08121a',
                        'accent' => '#31d6c8',
                        'onclick' => 'alert(1)',
                        'url' => 'javascript:alert(1)',
                    ],
                    'dashboard' => [
                        'text' => '#e8fbff',
                        'border' => '#1f3540',
                    ],
                    'admin' => [
                        'background' => '#ffffff',
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
            ->assertJsonPath('data.preferences.theme', 'violet')
            ->assertJsonPath('data.preferences.workspace_default_theme', 'violet')
            ->assertJsonPath('data.preferences.theme_motion', 'cinematic')
            ->assertJsonPath('data.preferences.theme_motion_disabled', true)
            ->assertJsonPath('data.preferences.theme_simple_animation', false)
            ->assertJsonPath('data.preferences.theme_background_disabled', false)
            ->assertJsonPath('data.preferences.theme_area_tokens.chat.background', '#02080c')
            ->assertJsonPath('data.preferences.theme_area_tokens.dashboard.text', '#e8fbff');

        $preferences = $response->json('data.preferences');
        $this->assertArrayNotHasKey('api_key', $preferences['theme_customization']);
        $this->assertArrayNotHasKey('style', $preferences['theme_customization']);
        $this->assertArrayNotHasKey('script', $preferences['theme_customization']);
        $this->assertArrayNotHasKey('background_url', $preferences['theme_customization']);
        $this->assertArrayNotHasKey('nested', $preferences['theme_customization']);
        $this->assertArrayNotHasKey('style', $preferences['theme_library'][0]['tokens']);
        $this->assertArrayNotHasKey('script', $preferences['theme_library'][0]['area_tokens']['chat']);
        $this->assertArrayNotHasKey('unknown', $preferences['theme_library'][0]['area_tokens']);
        $this->assertArrayNotHasKey('script', $preferences['theme_library'][0]);
        $this->assertArrayNotHasKey('style', $preferences['theme_library'][0]);
        $this->assertArrayNotHasKey('api_key', $preferences['theme_library'][0]);
        $this->assertArrayNotHasKey('onclick', $preferences['theme_area_tokens']['chat']);
        $this->assertArrayNotHasKey('url', $preferences['theme_area_tokens']['chat']);
        $this->assertArrayNotHasKey('admin', $preferences['theme_area_tokens']);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('operator', $storedPreferences);
        $this->assertStringNotContainsString('theme-secret', $storedPreferences);
        $this->assertStringNotContainsString('nested-theme-secret', $storedPreferences);
        $this->assertStringNotContainsString('library-secret', $storedPreferences);
        $this->assertStringNotContainsString('javascript:alert', $storedPreferences);
        $this->assertStringNotContainsString('display: none', $storedPreferences);
        $this->assertStringNotContainsString('alert(1)', $storedPreferences);
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

        $response->assertOk();

        $this->assertArrayNotHasKey('theme_motion', $response->json('data.preferences'));
        $this->assertSame([], json_decode((string) $this->storedPreferencesForCurrentUser(), true));
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
                    'duration_scale' => 180,
                    'intensity' => -20,
                    'easing' => 'cinematic',
                    'stagger' => 600,
                    'script' => 'alert(1)',
                    'style' => 'body { display: none; }',
                    'url' => 'javascript:alert(1)',
                    'api_key' => 'animation-secret',
                    'nested' => [
                        'open_close' => 'depth',
                    ],
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
                            'script' => 'alert(1)',
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

        $preferences = $response->json('data.preferences');
        $this->assertArrayNotHasKey('script', $preferences['ui_animation_customization']);
        $this->assertArrayNotHasKey('style', $preferences['ui_animation_customization']);
        $this->assertArrayNotHasKey('url', $preferences['ui_animation_customization']);
        $this->assertArrayNotHasKey('api_key', $preferences['ui_animation_customization']);
        $this->assertArrayNotHasKey('nested', $preferences['ui_animation_customization']);
        $this->assertArrayNotHasKey('script', $preferences['theme_library'][0]['ui_animation_customization']);

        $storedPreferences = $this->storedPreferencesForCurrentUser();
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('terminal-snap', $storedPreferences);
        $this->assertStringNotContainsString('animation-secret', $storedPreferences);
        $this->assertStringNotContainsString('javascript:alert', $storedPreferences);
        $this->assertStringNotContainsString('alert(1)', $storedPreferences);
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

        $response->assertOk();

        $preferences = $response->json('data.preferences');
        $this->assertArrayNotHasKey('ui_animation_profile', $preferences);
        $this->assertArrayNotHasKey('ui_animation_customization', $preferences);
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

    private function storedPreferencesForCurrentUser(): ?string
    {
        return DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->value('preferences');
    }
}
