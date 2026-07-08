<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosModelProfileApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.talos.model_provider_allowed_hosts' => [
                'api.openai.test',
                'api.deepseek.test',
                'api.openai.com',
                'api.deepseek.com',
            ],
        ]);
    }

    public function test_create_profile_stores_secret_and_response_omits_it(): void
    {
        $response = $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'OpenAI Work',
            'secret' => 'sk-secret-value',
            'base_url' => 'https://api.openai.test/v1',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.provider', 'openai')
            ->assertJsonPath('data.model', 'gpt-4.1')
            ->assertJsonPath('data.has_secret', true)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');

        $profile = TalosModelProfile::query()->firstOrFail();

        $this->assertNotSame('sk-secret-value', $profile->encrypted_secret);
        $this->assertSame('sk-secret-value', Crypt::decryptString((string) $profile->encrypted_secret));
    }

    public function test_list_and_show_omit_secret_fields(): void
    {
        $profile = TalosModelProfile::query()->create([
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'display_name' => 'DeepSeek',
            'encrypted_secret' => Crypt::encryptString('deepseek-secret'),
        ]);

        $this->getJson('/api/talos/model-profiles')
            ->assertOk()
            ->assertJsonPath('data.0.id', $profile->id)
            ->assertJsonPath('data.0.has_secret', true)
            ->assertJsonMissingPath('data.0.secret')
            ->assertJsonMissingPath('data.0.encrypted_secret');

        $this->getJson("/api/talos/model-profiles/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $profile->id)
            ->assertJsonPath('data.has_secret', true)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');
    }

    public function test_update_without_secret_preserves_existing_secret(): void
    {
        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Before',
            'encrypted_secret' => Crypt::encryptString('original-secret'),
        ]);

        $this->patchJson("/api/talos/model-profiles/{$profile->id}", [
            'display_name' => 'After',
            'model' => 'gpt-4.1-mini',
        ])
            ->assertOk()
            ->assertJsonPath('data.display_name', 'After')
            ->assertJsonPath('data.model', 'gpt-4.1-mini')
            ->assertJsonPath('data.has_secret', true)
            ->assertJsonMissingPath('data.encrypted_secret');

        $profile->refresh();

        $this->assertSame('original-secret', Crypt::decryptString((string) $profile->encrypted_secret));
    }

    public function test_update_with_secret_rotates_secret_without_returning_it(): void
    {
        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Before',
            'encrypted_secret' => Crypt::encryptString('original-secret'),
        ]);

        $this->patchJson("/api/talos/model-profiles/{$profile->id}", [
            'display_name' => 'After',
            'secret' => 'rotated-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.display_name', 'After')
            ->assertJsonPath('data.has_secret', true)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');

        $profile->refresh();

        $this->assertSame('rotated-secret', Crypt::decryptString((string) $profile->encrypted_secret));
    }

    public function test_invalid_provider_is_rejected_without_storing_profile(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'unsupported',
            'model' => 'unknown',
            'display_name' => 'Unsupported',
            'secret' => 'secret-value',
        ])
            ->assertUnprocessable()
            ->assertJsonMissing(['secret-value']);

        $this->assertSame(0, TalosModelProfile::query()->count());
    }

    public function test_private_provider_base_url_is_rejected_without_storing_profile(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Local metadata trap',
            'secret' => 'secret-value',
            'base_url' => 'http://127.0.0.1:8080/v1',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['base_url'])
            ->assertJsonMissing(['secret-value']);

        $this->assertSame(0, TalosModelProfile::query()->count());
    }

    public function test_probe_blocks_private_provider_base_url_without_sending_secret(): void
    {
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Unsafe Local',
            'encrypted_secret' => Crypt::encryptString('private-secret'),
            'base_url' => 'http://127.0.0.1:8080/v1',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.probe_result.ok', false)
            ->assertJsonMissing(['private-secret']);

        Http::assertNothingSent();
    }

    public function test_probe_marks_profile_healthy_for_successful_json_response(): void
    {
        Http::fake([
            'api.openai.test/v1/chat/completions' => Http::response(['id' => 'probe-ok'], 200),
        ]);

        $profile = TalosModelProfile::query()->create([
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'OpenAI',
            'encrypted_secret' => Crypt::encryptString('probe-secret'),
            'base_url' => 'https://api.openai.test/v1',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.probe_result.ok', true)
            ->assertJsonMissingPath('data.encrypted_secret');

        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.openai.test/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer probe-secret'));
    }

    public function test_probe_marks_profile_degraded_for_non_success_response(): void
    {
        Http::fake([
            'api.deepseek.test/chat/completions' => Http::response(['error' => 'bad key'], 401),
        ]);

        $profile = TalosModelProfile::query()->create([
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'display_name' => 'DeepSeek',
            'encrypted_secret' => Crypt::encryptString('probe-secret'),
            'base_url' => 'https://api.deepseek.test',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'degraded')
            ->assertJsonPath('data.probe_result.ok', false)
            ->assertJsonPath('data.probe_result.http_status', 401)
            ->assertJsonMissingPath('data.encrypted_secret');
    }
}
