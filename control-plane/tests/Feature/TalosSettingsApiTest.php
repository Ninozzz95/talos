<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosContextSet;
use App\Models\TalosModelProfile;
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
}
