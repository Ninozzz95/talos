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
use Illuminate\Testing\TestResponse;
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

    public function test_sensitive_censor_preference_is_strict_boolean_and_defaults_enabled(): void
    {
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonMissingPath('data.preferences.sensitive_censor');

        $this->assertTrue(TalosWorkspaceSetting::sensitiveCensorEnabled([]));

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'density' => 'compact',
                'sensitive_censor' => false,
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.sensitive_censor', false);

        foreach (['false', 0, null, []] as $invalidValue) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => ['sensitive_censor' => $invalidValue],
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('preferences.sensitive_censor');
        }

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.sensitive_censor', false);

        $preferences = TalosWorkspaceSetting::query()
            ->where('user_id', $this->user->id)
            ->firstOrFail()
            ->preferences;

        $this->assertFalse($preferences['sensitive_censor']);
        $this->assertFalse(TalosWorkspaceSetting::sensitiveCensorEnabled($preferences));
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
                'sensitive_censor' => false,
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
            ->assertJsonPath('data.preferences.sensitive_censor', false)
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
                    'mobile_window_presentation' => 'fullscreen',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.preferences.chat_layout.bubble_scale', 'expanded')
            ->assertJsonPath('data.preferences.chat_layout.composer_mode', 'minimal')
            ->assertJsonPath('data.preferences.chat_layout.advanced_rail_expanded', true)
            ->assertJsonPath('data.preferences.chat_layout.mobile_window_presentation', 'fullscreen');

        $layout = $response->json('data.preferences.chat_layout');
        $this->assertSame([
            'bubble_scale' => 'expanded',
            'composer_mode' => 'minimal',
            'advanced_rail_expanded' => true,
            'mobile_window_presentation' => 'fullscreen',
        ], $layout);

        $response = $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'chat_layout' => [
                    'bubble_scale' => 'giant',
                    'composer_mode' => 'hidden',
                    'advanced_rail_expanded' => 'yes',
                    'mobile_window_presentation' => 'side-sheet',
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'preferences.chat_layout.bubble_scale',
                'preferences.chat_layout.composer_mode',
                'preferences.chat_layout.advanced_rail_expanded',
                'preferences.chat_layout.mobile_window_presentation',
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
            'telemetry',
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

    public function test_telemetry_theme_is_accepted_and_unknown_theme_still_fails(): void
    {
        $motion = $this->motionV6Defaults();
        $motion['scene_override'] = 'telemetry';

        $this->patchJson('/api/talos/settings', [
            'preferences' => [
                'theme' => 'telemetry',
                'workspace_default_theme' => 'telemetry',
                'theme_motion_v6' => $motion,
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'telemetry')
            ->assertJsonPath('data.preferences.workspace_default_theme', 'telemetry')
            ->assertJsonPath('data.preferences.theme_motion_v6.scene_override', 'telemetry');

        $before = $this->storedPreferencesForCurrentUser();

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme' => 'telemetry-unknown'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('preferences.theme');

        $this->assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_sidebar_rail_preferences_validate_known_ids_and_strip_unknown(): void
    {
        $rail = [
            'order' => ['browse', 'runtime', 'calendar', 'compare', 'model_lab', 'research', 'gallery', 'library'],
            'collapsed_groups' => ['workbench'],
            'collapsed' => true,
        ];

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['sidebar_rail' => $rail],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.sidebar_rail', $rail);

        $settings = TalosWorkspaceSetting::query()
            ->where('user_id', $this->user->id)
            ->firstOrFail();
        $settings->preferences = [
            'density' => 'compact',
            'sidebar_rail' => [
                'order' => ['browse', 'unknown-station', 'browse', 'runtime', 17],
                'collapsed_groups' => ['workbench', 'unknown-group', 'workbench', 17],
                'collapsed' => true,
                'unexpected' => 'legacy-value',
            ],
        ];
        $settings->save();

        $response = $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.sidebar_rail.order.0', 'browse')
            ->assertJsonPath('data.preferences.sidebar_rail.order.1', 'runtime')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed_groups.0', 'workbench')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed', true)
            ->assertJsonMissingPath('data.preferences.sidebar_rail.unexpected');

        $response->assertJsonCount(2, 'data.preferences.sidebar_rail.order');
        $response->assertJsonCount(1, 'data.preferences.sidebar_rail.collapsed_groups');
    }

    public function test_sidebar_rail_invalid_writes_fail_atomically_with_exact_paths(): void
    {
        $baseline = [
            'order' => ['runtime', 'calendar', 'compare', 'model_lab', 'research', 'gallery', 'library', 'browse'],
            'collapsed_groups' => [],
            'collapsed' => false,
        ];

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'compact',
                'sidebar_rail' => $baseline,
            ],
        ]);
        $before = $this->storedPreferencesForCurrentUser();

        $invalidCases = [
            [null, 'preferences.sidebar_rail'],
            ['invalid', 'preferences.sidebar_rail'],
            [['runtime'], 'preferences.sidebar_rail'],
            [[
                'order' => $baseline['order'],
                'collapsed_groups' => [],
            ], 'preferences.sidebar_rail.collapsed'],
            [$baseline + ['unexpected' => true], 'preferences.sidebar_rail.unexpected'],
            [[
                'order' => ['first' => 'runtime'],
                'collapsed_groups' => [],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.order'],
            [[
                'order' => ['runtime', 'unknown-station'],
                'collapsed_groups' => [],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.order.1'],
            [[
                'order' => ['runtime', 'runtime'],
                'collapsed_groups' => [],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.order.1'],
            [[
                'order' => ['runtime'],
                'collapsed_groups' => ['first' => 'workbench'],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.collapsed_groups'],
            [[
                'order' => ['runtime'],
                'collapsed_groups' => ['unknown-group'],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.collapsed_groups.0'],
            [[
                'order' => ['runtime'],
                'collapsed_groups' => ['workbench', 'workbench'],
                'collapsed' => false,
            ], 'preferences.sidebar_rail.collapsed_groups.1'],
            [[
                'order' => ['runtime'],
                'collapsed_groups' => [],
                'collapsed' => 'false',
            ], 'preferences.sidebar_rail.collapsed'],
        ];

        foreach ($invalidCases as [$rail, $errorPath]) {
            $this->patchJson('/api/talos/settings', [
                'preferences' => ['sidebar_rail' => $rail],
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorPath);

            $this->assertSame($before, $this->storedPreferencesForCurrentUser(), $errorPath);
        }
    }

    public function test_sidebar_rail_raw_json_preserves_object_and_list_shapes_atomically(): void
    {
        $this->patchRawSettingsJson(<<<'JSON'
{"preferences":{"sidebar_rail":{"order":["runtime","browse"],"collapsed_groups":["workbench"],"collapsed":false}}}
JSON)
            ->assertOk()
            ->assertJsonPath('data.preferences.sidebar_rail.order.0', 'runtime')
            ->assertJsonPath('data.preferences.sidebar_rail.order.1', 'browse')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed_groups.0', 'workbench')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed', false);

        $before = $this->storedPreferencesForCurrentUser();
        $invalidBodies = [
            [<<<'JSON'
{"preferences":{"sidebar_rail":{"order":{},"collapsed_groups":[],"collapsed":false}}}
JSON, 'preferences.sidebar_rail.order'],
            [<<<'JSON'
{"preferences":{"sidebar_rail":{"order":{"0":"runtime"},"collapsed_groups":[],"collapsed":false}}}
JSON, 'preferences.sidebar_rail.order'],
            [<<<'JSON'
{"preferences":{"sidebar_rail":{"order":[],"collapsed_groups":{},"collapsed":false}}}
JSON, 'preferences.sidebar_rail.collapsed_groups'],
            [<<<'JSON'
{"preferences":{"sidebar_rail":{"order":[],"collapsed_groups":{"0":"workbench"},"collapsed":false}}}
JSON, 'preferences.sidebar_rail.collapsed_groups'],
        ];

        foreach ($invalidBodies as [$body, $errorPath]) {
            $this->patchRawSettingsJson($body)
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorPath);

            $this->assertSame($before, $this->storedPreferencesForCurrentUser(), $errorPath);
        }
    }

    public function test_sidebar_rail_legacy_raw_shape_is_omitted_without_read_mutation_or_reappearance(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['density' => 'compact'],
        ]);

        $raw = <<<'JSON'
{"density":"compact","sidebar_rail":{"order":{"0":"runtime"},"collapsed_groups":["workbench"],"collapsed":true,"unexpected":"legacy"}}
JSON;
        DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->update(['preferences' => $raw]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed_groups.0', 'workbench')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed', true)
            ->assertJsonMissingPath('data.preferences.sidebar_rail.order')
            ->assertJsonMissingPath('data.preferences.sidebar_rail.unexpected');
        $this->assertSame($raw, $this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['density' => 'comfortable'],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'comfortable')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed_groups.0', 'workbench')
            ->assertJsonPath('data.preferences.sidebar_rail.collapsed', true)
            ->assertJsonMissingPath('data.preferences.sidebar_rail.order')
            ->assertJsonMissingPath('data.preferences.sidebar_rail.unexpected');

        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertArrayNotHasKey('order', $stored['sidebar_rail']);
        $this->assertSame(['workbench'], $stored['sidebar_rail']['collapsed_groups']);
        $this->assertTrue($stored['sidebar_rail']['collapsed']);
    }

    public function test_onboarding_preferences_accept_canonical_outcomes_and_version_bounds(): void
    {
        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => [
                'onboarding' => [
                    'intro_version' => 1,
                    'intro_outcome' => 'completed',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.preferences.onboarding.intro_version', 1)
            ->assertJsonPath('data.preferences.onboarding.intro_outcome', 'completed');

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 1,
            'preferences' => [
                'onboarding' => [
                    'intro_version' => 65535,
                    'intro_outcome' => 'skipped',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.preferences.onboarding.intro_version', 65535)
            ->assertJsonPath('data.preferences.onboarding.intro_outcome', 'skipped');

        $stored = TalosWorkspaceSetting::query()
            ->where('user_id', $this->user->id)
            ->firstOrFail();

        $this->assertSame(2, (int) $stored->revision);
        $this->assertSame([
            'intro_version' => 65535,
            'intro_outcome' => 'skipped',
        ], $stored->preferences['onboarding']);
    }

    public function test_onboarding_preferences_reject_invalid_shapes_and_values_atomically(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'compact',
                'onboarding' => [
                    'intro_version' => 1,
                    'intro_outcome' => 'completed',
                ],
            ],
            'revision' => 7,
        ]);

        $before = $this->storedPreferencesForCurrentUser();
        $invalidCases = [
            [['intro_version' => 0, 'intro_outcome' => 'completed'], 'preferences.onboarding.intro_version'],
            [['intro_version' => 65536, 'intro_outcome' => 'completed'], 'preferences.onboarding.intro_version'],
            [['intro_version' => '1', 'intro_outcome' => 'completed'], 'preferences.onboarding.intro_version'],
            [['intro_version' => 1, 'intro_outcome' => 'dismissed'], 'preferences.onboarding.intro_outcome'],
            [['intro_version' => 1, 'intro_outcome' => 1], 'preferences.onboarding.intro_outcome'],
            [['intro_outcome' => 'completed'], 'preferences.onboarding.intro_version'],
            [['intro_version' => 1], 'preferences.onboarding.intro_outcome'],
            [[
                'intro_version' => 1,
                'intro_outcome' => 'completed',
                'unexpected' => true,
            ], 'preferences.onboarding.unexpected'],
            [null, 'preferences.onboarding'],
            ['completed', 'preferences.onboarding'],
            [['completed'], 'preferences.onboarding'],
            [(object) [], 'preferences.onboarding.intro_version'],
        ];

        foreach ($invalidCases as [$onboarding, $errorPath]) {
            $this->patchJson('/api/talos/settings', [
                'expected_revision' => 7,
                'preferences' => ['onboarding' => $onboarding],
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorPath);

            $this->assertSame($before, $this->storedPreferencesForCurrentUser(), $errorPath);
            $this->assertSame(
                7,
                (int) TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->value('revision'),
                $errorPath,
            );
        }
    }

    public function test_invalid_stored_onboarding_is_omitted_and_legacy_intro_seen_is_never_promoted(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [],
            'revision' => 3,
        ]);

        $raw = <<<'JSON'
{"density":"compact","intro_seen":true,"onboarding":[]}
JSON;
        DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->update(['preferences' => $raw]);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.revision', 3)
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonPath('data.preferences.intro_seen', true)
            ->assertJsonMissingPath('data.preferences.onboarding');

        $this->assertSame($raw, $this->storedPreferencesForCurrentUser());

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 3,
            'preferences' => ['density' => 'comfortable'],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 4)
            ->assertJsonPath('data.preferences.density', 'comfortable')
            ->assertJsonPath('data.preferences.intro_seen', true)
            ->assertJsonMissingPath('data.preferences.onboarding');

        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertArrayNotHasKey('onboarding', $stored);
        $this->assertTrue($stored['intro_seen']);
    }

    public function test_onboarding_revision_conflict_and_user_ownership_return_only_authoritative_snapshots(): void
    {
        $otherUser = User::factory()->create();
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $otherUser->id),
            'user_id' => $otherUser->id,
            'preferences' => [
                'onboarding' => [
                    'intro_version' => 42,
                    'intro_outcome' => 'skipped',
                ],
            ],
            'revision' => 3,
        ]);

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => [
                'onboarding' => [
                    'intro_version' => 1,
                    'intro_outcome' => 'completed',
                ],
            ],
        ])->assertOk();

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => [
                'onboarding' => [
                    'intro_version' => 2,
                    'intro_outcome' => 'skipped',
                ],
            ],
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TALOS_SETTINGS_REVISION_CONFLICT')
            ->assertJsonPath('data.user_id', $this->user->id)
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.preferences.onboarding.intro_version', 1)
            ->assertJsonPath('data.preferences.onboarding.intro_outcome', 'completed')
            ->assertJsonMissing(['intro_version' => 42]);

        $this->actingAs($otherUser);
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.user_id', $otherUser->id)
            ->assertJsonPath('data.revision', 3)
            ->assertJsonPath('data.preferences.onboarding.intro_version', 42)
            ->assertJsonPath('data.preferences.onboarding.intro_outcome', 'skipped')
            ->assertJsonMissing(['intro_version' => 1]);

        $this->actingAs($this->user);
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.onboarding.intro_version', 1)
            ->assertJsonPath('data.preferences.onboarding.intro_outcome', 'completed');
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
                        'mission_path' => false,
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
            ->assertJsonPath('data.preferences.appearance_visibility.chat_area.mission_path', false)
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

    public function test_theme_motion_v6_raw_json_distinguishes_scalar_list_and_empty_object_atomically(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['density' => 'compact'],
        ]);
        $before = $this->storedPreferencesForCurrentUser();

        foreach ([
            ['42', 'TALOS_THEME_MOTION_V6_INVALID_TYPE', 'field=preferences.theme_motion_v6'],
            ['[]', 'TALOS_THEME_MOTION_V6_INVALID_TYPE', 'field=preferences.theme_motion_v6'],
            ['{}', 'TALOS_THEME_MOTION_V6_MISSING_KEY', 'field=preferences.theme_motion_v6.schema_version'],
        ] as [$rawValue, $code, $path]) {
            $response = $this->patchRawThemeMotionV6Json($rawValue);

            $this->assertThemeMotionV6Error($response, $code, $path);
            self::assertSame($before, $this->storedPreferencesForCurrentUser());
        }
    }

    public function test_theme_motion_v6_truncated_json_fails_without_creating_or_touching_settings(): void
    {
        $truncated = '{"preferences":{"theme_motion_v6":{"schema_version":1';

        $this->assertThemeMotionV6Error(
            $this->patchRawSettingsJson($truncated),
            'TALOS_THEME_MOTION_V6_SERIALIZATION_ERROR',
            'field=preferences.theme_motion_v6',
        );
        self::assertSame(
            0,
            TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->count(),
        );

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['density' => 'compact'],
        ]);
        DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->update([
                'created_at' => '2026-01-01 00:00:00',
                'updated_at' => '2026-01-01 00:00:00',
            ]);
        $before = (array) DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->first();

        $this->assertThemeMotionV6Error(
            $this->patchRawSettingsJson($truncated),
            'TALOS_THEME_MOTION_V6_SERIALIZATION_ERROR',
            'field=preferences.theme_motion_v6',
        );

        self::assertSame(
            $before,
            (array) DB::table('talos_workspace_settings')
                ->where('user_id', $this->user->id)
                ->first(),
        );
    }

    public function test_empty_and_whitespace_json_bodies_are_storage_noops(): void
    {
        $emptyBodies = ['', " \r\n\t"];

        foreach ($emptyBodies as $body) {
            $this->patchRawSettingsJson($body)
                ->assertOk()
                ->assertJsonPath('data.user_id', $this->user->id)
                ->assertJsonPath('data.preferences', []);
            self::assertSame(
                0,
                TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->count(),
            );
        }

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => ['density' => 'compact'],
        ]);
        DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->update([
                'created_at' => '2026-01-01 00:00:00',
                'updated_at' => '2026-01-01 00:00:00',
            ]);
        $before = (array) DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->first();

        foreach ($emptyBodies as $body) {
            $this->patchRawSettingsJson($body)
                ->assertOk()
                ->assertJsonPath('data.preferences.density', 'compact');
            self::assertSame(
                $before,
                (array) DB::table('talos_workspace_settings')
                    ->where('user_id', $this->user->id)
                    ->first(),
            );
        }
    }

    public function test_non_json_whitespace_byte_remains_malformed_and_atomic(): void
    {
        $this->assertThemeMotionV6Error(
            $this->patchRawSettingsJson("\0"),
            'TALOS_THEME_MOTION_V6_SERIALIZATION_ERROR',
            'field=preferences.theme_motion_v6',
        );

        self::assertSame(
            0,
            TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->count(),
        );
    }

    public function test_theme_motion_v6_rejects_mode_with_its_exact_path_atomically(): void
    {
        $before = $this->seedAtomicMotionBaseline();
        $invalid = $this->motionV6Defaults();
        $invalid['mode'] = 'unsupported';

        $response = $this->patchRawThemeMotionV6($invalid);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_INVALID_VALUE',
            'field=preferences.theme_motion_v6.mode',
        );
        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_rejects_speed_with_its_exact_path_atomically(): void
    {
        $before = $this->seedAtomicMotionBaseline();
        $invalid = $this->motionV6Defaults();
        $invalid['speed'] = 201;

        $response = $this->patchRawThemeMotionV6($invalid);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_OUT_OF_RANGE',
            'field=preferences.theme_motion_v6.speed',
        );
        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_raw_json_reports_non_finite_speed_at_exact_path_atomically(): void
    {
        $before = $this->seedAtomicMotionBaseline();
        $rawMotion = json_encode(
            $this->motionV6Defaults(),
            JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
        $rawMotion = str_replace('"speed":100', '"speed":1e10000', $rawMotion, $replacements);
        self::assertSame(1, $replacements);

        $response = $this->patchRawThemeMotionV6Json($rawMotion);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_NOT_FINITE',
            'field=preferences.theme_motion_v6.speed',
        );
        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_rejects_interface_easing_with_its_exact_path_atomically(): void
    {
        $before = $this->seedAtomicMotionBaseline();
        $invalid = $this->motionV6Defaults();
        $invalid['interface']['easing'] = 'spring';

        $response = $this->patchRawThemeMotionV6($invalid);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_INVALID_VALUE',
            'field=preferences.theme_motion_v6.interface.easing',
        );
        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_rejects_unknown_key_with_field_path(): void
    {
        $invalid = $this->motionV6Defaults();
        $invalid['unexpected'] = true;

        $response = $this->patchRawThemeMotionV6($invalid);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_UNKNOWN_KEY',
            'field=preferences.theme_motion_v6.unexpected',
        );
        self::assertNull($this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_rejects_oversized_payload_with_stable_actionable_error(): void
    {
        $before = $this->storedPreferencesForCurrentUser();
        $oversized = $this->motionV6Defaults();
        $oversized['interface']['categories']['feedback'] = str_repeat('x', 16_384);

        $response = $this->patchRawThemeMotionV6($oversized);

        $this->assertThemeMotionV6Error(
            $response,
            'TALOS_THEME_MOTION_V6_PAYLOAD_TOO_LARGE',
            'field=preferences.theme_motion_v6',
        );
        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_motion_v6_accepts_large_editor_envelope_with_fifty_named_themes(): void
    {
        $library = [];
        for ($index = 1; $index <= 50; $index++) {
            $library[] = $this->editorThemeRecord($index);
        }

        $motion = $this->motionV6Defaults();
        $payload = [
            'preferences' => [
                'theme_library' => $library,
                'theme_motion_v6' => $motion,
            ],
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        self::assertGreaterThan(65_536, strlen($json));
        self::assertLessThan(8 * 1024 * 1024, strlen($json));

        $response = $this->patchRawSettingsJson($json)->assertOk();

        self::assertSame($library, $response->json('data.preferences.theme_library'));
        self::assertSame($motion, $response->json('data.preferences.theme_motion_v6'));

        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame($library, $stored['theme_library']);
        self::assertSame($motion, $stored['theme_motion_v6']);
    }

    public function test_theme_motion_v6_accepts_generic_preference_nested_beyond_sixteen_levels(): void
    {
        $nested = ['leaf' => 'preserved'];
        for ($level = 24; $level >= 1; $level--) {
            $nested = ["level_{$level}" => $nested];
        }

        $motion = $this->motionV6Defaults();
        $payload = [
            'preferences' => [
                'advanced_generic_preference' => $nested,
                'theme_motion_v6' => $motion,
            ],
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        $response = $this->patchRawSettingsJson($json)->assertOk();

        self::assertSame($nested, $response->json('data.preferences.advanced_generic_preference'));
        self::assertSame($motion, $response->json('data.preferences.theme_motion_v6'));
    }

    public function test_theme_motion_v6_non_json_request_keeps_existing_validation_path(): void
    {
        $motion = $this->motionV6Defaults();

        $response = $this->call(
            'PATCH',
            '/api/talos/settings',
            ['preferences' => ['theme_motion_v6' => $motion]],
            [],
            [],
            ['HTTP_ACCEPT' => 'application/json'],
        )->assertOk();

        self::assertSame($motion, $response->json('data.preferences.theme_motion_v6'));
    }

    public function test_theme_motion_v6_persists_nonzero_glow_and_returns_it_on_fresh_read(): void
    {
        $motion = $this->motionV6Defaults();
        $motion['glow_intensity'] = 73;

        $this->patchRawThemeMotionV6($motion)
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_motion_v6.glow_intensity', 73);

        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 32, JSON_THROW_ON_ERROR);
        self::assertSame($motion, $stored['theme_motion_v6']);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_motion_v6.glow_intensity', 73)
            ->assertJsonPath('data.preferences.theme_motion_v6.interface.duration_scale', 50);
    }

    public function test_legacy_v6_without_glow_is_canonicalized_through_api_and_storage(): void
    {
        $legacy = $this->motionV6Defaults();
        $legacy['interface']['duration_scale'] = 100;
        unset($legacy['glow_intensity']);
        $canonical = $this->motionV6Defaults();
        $canonical['interface']['duration_scale'] = 100;

        $response = $this->patchRawThemeMotionV6($legacy)->assertOk();

        self::assertSame($canonical, $response->json('data.preferences.theme_motion_v6'));
        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 32, JSON_THROW_ON_ERROR);
        self::assertSame($canonical, $stored['theme_motion_v6']);
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_motion_v6.glow_intensity', 0)
            ->assertJsonPath('data.preferences.theme_motion_v6.interface.duration_scale', 100);
    }

    public function test_theme_motion_v6_only_delta_preserves_legacy_bytes_and_persists_exact_canonical_value(): void
    {
        $legacy = [
            'theme' => 'terminal',
            'theme_customization' => [
                'background' => '#02080c',
                'panel' => '#08121a',
                'text' => '#e8fbff',
                'accent' => '#31d6c8',
                'font' => 'serif',
            ],
            'chat_layout' => [
                'bubble_scale' => 'expanded',
                'composer_mode' => 'minimal',
                'advanced_rail_expanded' => true,
            ],
            'density' => 'comfortable',
        ];
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => $legacy,
        ]);
        $legacyBytes = json_encode($legacy, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $motion = array_replace($this->motionV6Defaults(), [
            'mode' => 'complex',
            'speed' => 125,
            'scene_override' => 'signal',
        ]);

        $response = $this->patchRawThemeMotionV6($motion)->assertOk();
        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 32, JSON_THROW_ON_ERROR);
        $storedMotion = $stored['theme_motion_v6'];
        unset($stored['theme_motion_v6']);

        self::assertSame($motion, $storedMotion);
        self::assertSame($legacy, $stored);
        self::assertSame($legacyBytes, json_encode($stored, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        self::assertSame($motion, $response->json('data.preferences.theme_motion_v6'));
        self::assertSame($legacy['theme_customization'], $response->json('data.preferences.theme_customization'));
        self::assertSame($legacy['chat_layout'], $response->json('data.preferences.chat_layout'));
    }

    public function test_invalid_stored_theme_motion_v6_is_omitted_fail_closed_without_mutating_storage(): void
    {
        $invalid = $this->motionV6Defaults();
        unset($invalid['interface']['categories']['feedback']);
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'density' => 'compact',
                'theme_motion_v6' => $invalid,
            ],
        ]);
        $before = $this->storedPreferencesForCurrentUser();

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.density', 'compact')
            ->assertJsonMissingPath('data.preferences.theme_motion_v6');

        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_policy_lock_blocks_theme_motion_v6_but_keeps_storage_unchanged(): void
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'forge',
                'theme_policy_locked' => true,
                'theme_motion_v6' => $this->motionV6Defaults(),
            ],
        ]);
        $before = $this->storedPreferencesForCurrentUser();
        $changed = $this->motionV6Defaults();
        $changed['mode'] = 'off';

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_motion_v6' => $changed],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Theme changes are locked by workspace policy.');

        self::assertSame($before, $this->storedPreferencesForCurrentUser());
    }

    public function test_theme_policy_lock_accepts_semantically_equal_float_numeric_motion_v6(): void
    {
        $canonical = $this->motionV6Defaults();
        $canonical['dpr_cap'] = 1;
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme_policy_locked' => true,
                'theme_motion_v6' => $canonical,
            ],
        ]);

        $floatMotion = $canonical;
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
            'dpr_cap',
        ] as $key) {
            $floatMotion[$key] = (float) $floatMotion[$key];
        }
        foreach (['duration_scale', 'intensity', 'stagger'] as $key) {
            $floatMotion['interface'][$key] = (float) $floatMotion['interface'][$key];
        }
        $rawMotion = json_encode(
            $floatMotion,
            JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
        self::assertStringContainsString('"speed":100.0', $rawMotion);
        self::assertStringContainsString('"dpr_cap":1.0', $rawMotion);

        $response = $this->patchRawThemeMotionV6Json($rawMotion)->assertOk();

        self::assertSame($canonical, $response->json('data.preferences.theme_motion_v6'));
        $stored = json_decode((string) $this->storedPreferencesForCurrentUser(), true, 32, JSON_THROW_ON_ERROR);
        self::assertSame($canonical, $stored['theme_motion_v6']);
        self::assertTrue($stored['theme_policy_locked']);
    }

    public function test_theme_motion_v6_is_user_scoped_on_read_and_write(): void
    {
        $this->patchJson('/api/talos/settings', [
            'preferences' => ['theme_motion_v6' => $this->motionV6Defaults()],
        ])->assertOk();

        $otherUser = User::factory()->create();
        $this->actingAs($otherUser);

        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.user_id', $otherUser->id)
            ->assertJsonMissingPath('data.preferences.theme_motion_v6');
    }

    public function test_named_theme_motion_v6_is_validated_persisted_and_returned_without_data_loss(): void
    {
        $motion = array_replace($this->motionV6Defaults(), [
            'mode' => 'complex',
            'scene_override' => 'violet',
            'speed' => 135,
        ]);
        $theme = [
            'id' => 'v6-library-theme',
            'name' => 'V6 Library Theme',
            'base_theme' => 'violet',
            'tokens' => ['font' => 'display'],
            'motion_v6' => $motion,
        ];

        $response = $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => ['theme_library' => [$theme]],
        ])->assertOk();

        self::assertSame(1, $response->json('data.revision'));
        self::assertSame($motion, $response->json('data.preferences.theme_library.0.motion_v6'));
        $this->getJson('/api/talos/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme_library.0.motion_v6.scene_override', 'violet');

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 1,
            'preferences' => ['unrelated_preference' => 'preserved'],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.preferences.theme_library.0.motion_v6.speed', 135);
    }

    public function test_named_theme_rejects_invalid_motion_v6_at_the_real_api_boundary(): void
    {
        $invalid = $this->motionV6Defaults();
        $invalid['speed'] = 999;

        $response = $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => [
                'theme_library' => [[
                    'id' => 'invalid-motion-theme',
                    'name' => 'Invalid Motion Theme',
                    'base_theme' => 'forge',
                    'tokens' => [],
                    'motion_v6' => $invalid,
                ]],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('preferences.theme_library.0.motion_v6');

        self::assertSame(
            ['TALOS_THEME_MOTION_V6_OUT_OF_RANGE field=preferences.theme_library.0.motion_v6.speed: Value must be an integer from 25 through 200.'],
            $response->json('errors')['preferences.theme_library.0.motion_v6'],
        );

        self::assertSame(0, TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->count());
    }

    public function test_settings_revision_conflict_returns_authoritative_snapshot_and_preserves_storage(): void
    {
        $first = $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => ['theme' => 'paper'],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1);
        self::assertSame('paper', $first->json('data.preferences.theme'));

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 0,
            'preferences' => ['theme' => 'terminal'],
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TALOS_SETTINGS_REVISION_CONFLICT')
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.preferences.theme', 'paper');

        $stored = TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->firstOrFail();
        self::assertSame(1, (int) $stored->revision);
        self::assertSame('paper', $stored->preferences['theme']);

        $this->patchJson('/api/talos/settings', [
            'expected_revision' => 1,
            'preferences' => ['theme' => 'terminal'],
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.preferences.theme', 'terminal');
    }

    public function test_browser_hmi_mode_is_validated_persisted_and_returned_with_effective_policy(): void
    {
        config(['services.talos.browser.hmi_min_mode' => null]);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['browser_hmi_mode' => 'confirm_every_interaction'],
        ])
            ->assertOk()
            ->assertJsonPath('data.preferences.browser_hmi_mode', 'confirm_every_interaction')
            ->assertJsonPath('data.browser_hmi_policy.user_mode', 'confirm_every_interaction')
            ->assertJsonPath('data.browser_hmi_policy.workspace_minimum_mode', null)
            ->assertJsonPath('data.browser_hmi_policy.effective_mode', 'confirm_every_interaction')
            ->assertJsonPath('data.browser_hmi_policy.preference_constrained', false);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['browser_hmi_mode' => 'unrestricted'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('preferences.browser_hmi_mode');

        self::assertSame(
            'confirm_every_interaction',
            TalosWorkspaceSetting::query()->where('user_id', $this->user->id)->value('preferences')['browser_hmi_mode'],
        );
    }

    public function test_workspace_browser_hmi_floor_is_disclosed_and_cannot_be_weakened_by_user_preference(): void
    {
        config(['services.talos.browser.hmi_min_mode' => 'confirm_every_interaction']);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['browser_hmi_mode' => 'confirm_sensitive'],
        ])
            ->assertOk()
            ->assertJsonPath('data.browser_hmi_policy.user_mode', 'confirm_sensitive')
            ->assertJsonPath('data.browser_hmi_policy.workspace_minimum_mode', 'confirm_every_interaction')
            ->assertJsonPath('data.browser_hmi_policy.effective_mode', 'confirm_every_interaction')
            ->assertJsonPath('data.browser_hmi_policy.preference_constrained', true);

        $this->patchJson('/api/talos/settings', [
            'preferences' => ['browser_hmi_mode' => 'read_only'],
        ])
            ->assertOk()
            ->assertJsonPath('data.browser_hmi_policy.user_mode', 'read_only')
            ->assertJsonPath('data.browser_hmi_policy.effective_mode', 'read_only')
            ->assertJsonPath('data.browser_hmi_policy.preference_constrained', false);
    }

    private function seedAtomicMotionBaseline(): string
    {
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'preferences' => [
                'theme' => 'forge',
                'density' => 'compact',
                'theme_motion_v6' => $this->motionV6Defaults(),
            ],
        ]);

        return (string) $this->storedPreferencesForCurrentUser();
    }

    /** @param array<string, mixed> $motion */
    private function patchRawThemeMotionV6(array $motion): TestResponse
    {
        return $this->patchRawThemeMotionV6Json(json_encode($motion, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    private function patchRawThemeMotionV6Json(string $rawValue): TestResponse
    {
        return $this->patchRawSettingsJson('{"preferences":{"theme_motion_v6":'.$rawValue.'}}');
    }

    private function patchRawSettingsJson(string $json): TestResponse
    {
        return $this->call(
            'PATCH',
            '/api/talos/settings',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
            ],
            $json,
        );
    }

    private function assertThemeMotionV6Error(TestResponse $response, string $code, string $path): void
    {
        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['preferences.theme_motion_v6']);

        $errors = $response->json('errors');
        self::assertIsArray($errors);
        $messages = $errors['preferences.theme_motion_v6'] ?? null;
        self::assertIsArray($messages);
        $joined = implode("\n", $messages);
        self::assertStringContainsString($code, $joined);
        self::assertStringContainsString($path, $joined);
    }

    private function storedPreferencesForCurrentUser(): ?string
    {
        return DB::table('talos_workspace_settings')
            ->where('user_id', $this->user->id)
            ->value('preferences');
    }

    /**
     * @return array<string, mixed>
     */
    private function motionV6Defaults(): array
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
     * @param  array<string, mixed>  $overrides
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

    /**
     * @return array<string, mixed>
     */
    private function editorThemeRecord(int $index): array
    {
        $area = [
            'background' => '#02080c',
            'surface' => '#08121a',
            'text' => '#e8fbff',
            'muted' => '#b8cbd0',
            'border' => '#1f3540',
            'accent' => '#31d6c8',
        ];
        $areaTokens = [];
        foreach (['sidebar', 'chat', 'composer', 'window', 'header', 'button', 'card', 'code'] as $areaName) {
            $areaTokens[$areaName] = $area;
        }

        return $this->namedThemeRecord(sprintf('editor-theme-%02d', $index), [
            'name' => sprintf('Editor Theme %02d %s', $index, str_repeat('X', 48)),
            'theme_mode' => 'dark',
            'tokens' => [
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
            ],
            'area_tokens' => $areaTokens,
            'motion' => 'subtle',
            'ui_animation_profile' => 'custom',
            'ui_animation_customization' => [
                'open_close' => 'depth',
                'surface_transition' => 'axis-shift',
                'feedback' => 'trace',
                'hover' => 'node-glow',
                'duration_scale' => 100,
                'intensity' => 65,
                'easing' => 'precise',
                'stagger' => 40,
            ],
            'chat_layout' => [
                'bubble_scale' => 'expanded',
                'composer_mode' => 'minimal',
                'advanced_rail_expanded' => true,
            ],
            'created_at' => '2026-07-11T12:00:00Z',
            'updated_at' => '2026-07-11T12:00:00Z',
        ]);
    }
}
