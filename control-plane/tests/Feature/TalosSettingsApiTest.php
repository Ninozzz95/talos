<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
use App\Models\TalosWorkspaceSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class TalosSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_settings_can_store_and_return_only_safe_preferences(): void
    {
        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);
        $contextSet = TalosContextSet::query()->create([
            'name' => 'Default context',
            'status' => 'available',
        ]);

        $response = $this->patchJson('/api/talos/settings', [
            'default_model_profile_id' => $profile->id,
            'default_context_set_id' => $contextSet->id,
            'preferences' => [
                'density' => 'compact',
                'api_key' => 'client-secret',
                'nested' => [
                    'secret' => 'nested-secret',
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
        $this->assertArrayNotHasKey('secret', $data['preferences']['nested']);
        $this->assertArrayNotHasKey('encrypted_secret', $data['preferences']['providers'][0]);

        $storedPreferences = DB::table('talos_workspace_settings')->value('preferences');
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('compact', $storedPreferences);
        $this->assertStringNotContainsString('client-secret', $storedPreferences);
        $this->assertStringNotContainsString('nested-secret', $storedPreferences);
        $this->assertStringNotContainsString('provider-secret', $storedPreferences);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.default_model_profile_id', $profile->id)
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.theme', 'terminal')
            ->assertJsonPath('data.preferences.search.provider', 'searxng')
            ->assertJsonMissing(['api_key' => 'client-secret'])
            ->assertJsonMissing(['secret' => 'nested-secret'])
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
        ];

        foreach ($themes as $theme) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => [
                    'theme' => $theme,
                ],
            ])
                ->assertOk()
                ->assertJsonPath('data.preferences.theme', $theme);

            $storedPreferences = DB::table('talos_workspace_settings')->value('preferences');
            $this->assertIsString($storedPreferences);
            $this->assertStringContainsString($theme, $storedPreferences);

            $this->getJson('/api/talos/settings')
                ->assertOk()
                ->assertJsonPath('data.preferences.theme', $theme);
        }
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
            ->assertJsonPath('data.preferences.theme_library.0.id', 'operator')
            ->assertJsonPath('data.preferences.theme_library.0.name', 'Operator')
            ->assertJsonPath('data.preferences.theme_library.0.base_theme', 'forge')
            ->assertJsonPath('data.preferences.theme_library.0.tokens.background', '#02080c')
            ->assertJsonPath('data.preferences.theme_library.0.area_tokens.chat.accent', '#31d6c8')
            ->assertJsonPath('data.preferences.theme_library.0.motion', 'subtle')
            ->assertJsonPath('data.preferences.theme', 'violet')
            ->assertJsonPath('data.preferences.workspace_default_theme', 'violet')
            ->assertJsonPath('data.preferences.theme_motion', 'cinematic')
            ->assertJsonPath('data.preferences.theme_motion_disabled', true)
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

        $storedPreferences = DB::table('talos_workspace_settings')->value('preferences');
        $this->assertIsString($storedPreferences);
        $this->assertStringContainsString('operator', $storedPreferences);
        $this->assertStringNotContainsString('theme-secret', $storedPreferences);
        $this->assertStringNotContainsString('nested-theme-secret', $storedPreferences);
        $this->assertStringNotContainsString('library-secret', $storedPreferences);
        $this->assertStringNotContainsString('javascript:alert', $storedPreferences);
        $this->assertStringNotContainsString('display: none', $storedPreferences);
        $this->assertStringNotContainsString('alert(1)', $storedPreferences);
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
        $this->assertSame([], json_decode((string) DB::table('talos_workspace_settings')->value('preferences'), true));
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

        $storedPreferences = DB::table('talos_workspace_settings')->value('preferences');
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
            'id' => TalosWorkspaceSetting::DEFAULT_ID,
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
}
