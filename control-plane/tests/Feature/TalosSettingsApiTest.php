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
                    'theme' => 'dark',
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
            ->assertJsonPath('data.preferences.nested.theme', 'dark');

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
}
