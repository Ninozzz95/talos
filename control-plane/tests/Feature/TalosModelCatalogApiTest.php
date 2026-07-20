<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\User;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosModelCatalogApiTest extends TestCase
{
    use RefreshDatabase;

    private const ALLOWED_HOSTS = ['api.openai.test', 'api.anthropic.test'];

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        config(['services.talos.model_provider_allowed_hosts' => self::ALLOWED_HOSTS]);
        $this->app->instance(PublicHttpRequestPinning::class, new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                self::ALLOWED_HOSTS,
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ));
    }

    public function test_draft_discovery_returns_the_frozen_envelope(): void
    {
        Http::fake([
            'api.openai.test/v1/models' => Http::response([
                'object' => 'list',
                'data' => [['id' => 'gpt-4.1-mini', 'owned_by' => 'openai'], ['id' => 'gpt-4.1', 'owned_by' => 'openai']],
            ]),
        ]);

        $this->postJson('/api/talos/model-profiles/discover-draft', [
            'provider' => 'openai',
            'base_url' => 'https://api.openai.test/v1',
            'secret' => 'sk-openai',
        ])
            ->assertOk()
            ->assertJsonPath('data.provider', 'openai')
            ->assertJsonPath('data.complete', true)
            ->assertJsonPath('data.profile_id', null)
            ->assertJsonPath('data.models.0.id', 'gpt-4.1-mini')
            ->assertJsonCount(2, 'data.models');
    }

    public function test_draft_discovery_without_secret_returns_the_typed_secret_missing_fault(): void
    {
        Http::fake();

        $this->postJson('/api/talos/model-profiles/discover-draft', [
            'provider' => 'openai',
            'base_url' => 'https://api.openai.test/v1',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'MODEL_CATALOG_SECRET_MISSING');

        Http::assertNothingSent();
    }

    public function test_draft_discovery_maps_provider_auth_failure_to_a_typed_error(): void
    {
        Http::fake(['api.openai.test/v1/models' => Http::response(['error' => 'nope'], 401)]);

        $this->postJson('/api/talos/model-profiles/discover-draft', [
            'provider' => 'openai',
            'base_url' => 'https://api.openai.test/v1',
            'secret' => 'sk-bad',
        ])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'MODEL_CATALOG_AUTH_FAILED')
            ->assertJsonMissing(['secret' => 'sk-bad']);
    }

    public function test_persisted_discovery_is_owner_scoped_and_uses_the_stored_secret(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Mine',
            'base_url' => 'https://api.openai.test/v1',
            'encrypted_secret' => Crypt::encryptString('sk-owner'),
            'timeout_seconds' => 60,
            'status' => 'untested',
        ]);

        Http::fake(['api.openai.test/v1/models' => Http::response(['object' => 'list', 'data' => [['id' => 'gpt-4.1', 'owned_by' => 'openai']]])]);

        $this->getJson("/api/talos/model-profiles/{$profile->id}/models")
            ->assertOk()
            ->assertJsonPath('data.provider', 'openai')
            ->assertJsonPath('data.profile_id', $profile->id)
            ->assertJsonCount(1, 'data.models');

        Http::assertSent(static fn ($request): bool => $request->hasHeader('Authorization', 'Bearer sk-owner'));
    }

    public function test_persisted_discovery_of_a_foreign_profile_is_not_found(): void
    {
        $foreignProfile = TalosModelProfile::query()->create([
            'user_id' => User::factory()->create()->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Theirs',
            'base_url' => 'https://api.openai.test/v1',
            'encrypted_secret' => Crypt::encryptString('sk-theirs'),
            'timeout_seconds' => 60,
            'status' => 'untested',
        ]);

        Http::fake();

        $this->getJson("/api/talos/model-profiles/{$foreignProfile->id}/models")->assertNotFound();

        Http::assertNothingSent();
    }
}
