<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\User;
use App\Services\Models\Catalog\TalosProviderModelCatalogException;
use App\Services\Models\TalosProviderModelCatalogService;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosProviderModelCatalogServiceTest extends TestCase
{
    private const ALLOWED_HOSTS = ['api.openai.test', 'api.anthropic.test', 'openrouter.test', 'generativelanguage.test'];

    protected function setUp(): void
    {
        parent::setUp();
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

    private function service(): TalosProviderModelCatalogService
    {
        return $this->app->make(TalosProviderModelCatalogService::class);
    }

    public function test_draft_discovery_returns_the_frozen_envelope_for_openai(): void
    {
        Http::fake([
            'api.openai.test/v1/models' => Http::response([
                'object' => 'list',
                'data' => [
                    ['id' => 'gpt-4.1-mini', 'owned_by' => 'openai'],
                    ['id' => 'gpt-4.1', 'owned_by' => 'openai'],
                    ['id' => 'gpt-4.1-mini', 'owned_by' => 'openai'],
                ],
            ]),
        ]);

        $envelope = $this->service()->discoverDraft([
            'provider' => 'openai',
            'base_url' => 'https://api.openai.test/v1',
            'secret' => 'sk-openai',
        ]);

        self::assertNull($envelope['profile_id']);
        self::assertSame('openai', $envelope['provider']);
        self::assertTrue($envelope['complete']);
        self::assertSame(1, $envelope['page_count']);
        self::assertSame([], $envelope['warnings']);
        self::assertCount(2, $envelope['models']); // deduped by id
        self::assertSame('gpt-4.1-mini', $envelope['models'][0]['id']);
        self::assertSame('unknown', $envelope['models'][0]['chat_compatibility']);
    }

    public function test_draft_discovery_follows_anthropic_pagination(): void
    {
        Http::fake([
            'api.anthropic.test/v1/models?limit=1000' => Http::response([
                'data' => [['id' => 'claude-a', 'display_name' => 'A', 'type' => 'model']],
                'has_more' => true,
                'last_id' => 'claude-a',
            ]),
            'api.anthropic.test/v1/models?limit=1000&after_id=claude-a' => Http::response([
                'data' => [['id' => 'claude-b', 'display_name' => 'B', 'type' => 'model']],
                'has_more' => false,
                'last_id' => 'claude-b',
            ]),
        ]);

        $envelope = $this->service()->discoverDraft([
            'provider' => 'anthropic',
            'base_url' => 'https://api.anthropic.test/v1',
            'secret' => 'sk-ant',
        ]);

        self::assertTrue($envelope['complete']);
        self::assertSame(2, $envelope['page_count']);
        self::assertSame(['claude-a', 'claude-b'], array_column($envelope['models'], 'id'));
    }

    public function test_draft_discovery_rejects_a_missing_secret_for_a_remote_provider(): void
    {
        Http::fake();

        try {
            $this->service()->discoverDraft(['provider' => 'openai', 'base_url' => 'https://api.openai.test/v1']);
            self::fail('Expected a typed secret-missing fault.');
        } catch (TalosProviderModelCatalogException $exception) {
            self::assertSame(TalosProviderModelCatalogException::SECRET_MISSING, $exception->faultCode());
        }
        Http::assertNothingSent();
    }

    public function test_draft_discovery_maps_http_auth_failure_to_a_typed_fault(): void
    {
        Http::fake([
            'api.openai.test/v1/models' => Http::response(['error' => 'unauthorized'], 401),
        ]);

        $this->expectException(TalosProviderModelCatalogException::class);
        try {
            $this->service()->discoverDraft(['provider' => 'openai', 'base_url' => 'https://api.openai.test/v1', 'secret' => 'sk-bad']);
        } catch (TalosProviderModelCatalogException $exception) {
            self::assertSame(TalosProviderModelCatalogException::AUTH_FAILED, $exception->faultCode());
            throw $exception;
        }
    }

    public function test_draft_discovery_maps_rate_limit_to_a_retryable_fault(): void
    {
        Http::fake([
            'api.openai.test/v1/models' => Http::response(['error' => 'slow down'], 429, ['Retry-After' => '30']),
        ]);

        try {
            $this->service()->discoverDraft(['provider' => 'openai', 'base_url' => 'https://api.openai.test/v1', 'secret' => 'sk']);
            self::fail('Expected a rate-limit fault.');
        } catch (TalosProviderModelCatalogException $exception) {
            self::assertSame(TalosProviderModelCatalogException::RATE_LIMITED, $exception->faultCode());
            self::assertTrue($exception->retryable());
            self::assertSame(30, $exception->retryAfterSeconds());
        }
    }

    public function test_draft_discovery_blocks_a_redirect_response(): void
    {
        Http::fake([
            'api.openai.test/v1/models' => Http::response('', 302, ['Location' => 'https://evil.test/models']),
        ]);

        try {
            $this->service()->discoverDraft(['provider' => 'openai', 'base_url' => 'https://api.openai.test/v1', 'secret' => 'sk']);
            self::fail('Expected a redirect-blocked fault.');
        } catch (TalosProviderModelCatalogException $exception) {
            self::assertSame(TalosProviderModelCatalogException::REDIRECT_BLOCKED, $exception->faultCode());
        }
    }

    public function test_persisted_discovery_decrypts_the_owner_secret_and_carries_the_profile_id(): void
    {
        $user = User::factory()->make(['id' => 7]);
        $profile = new TalosModelProfile([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'base_url' => 'https://api.openai.test/v1',
        ]);
        $profile->id = 'profile-123';
        $profile->encrypted_secret = Crypt::encryptString('sk-owner');

        Http::fake([
            'api.openai.test/v1/models' => Http::response(['object' => 'list', 'data' => [['id' => 'gpt-4.1', 'owned_by' => 'openai']]]),
        ]);

        $envelope = $this->service()->discoverForProfile($profile);

        self::assertSame('profile-123', $envelope['profile_id']);
        self::assertSame('openai', $envelope['provider']);
        self::assertCount(1, $envelope['models']);
        Http::assertSent(static fn ($request): bool => $request->hasHeader('Authorization', 'Bearer sk-owner'));
    }

    public function test_draft_discovery_caps_the_model_count_and_reports_incomplete(): void
    {
        $page = ['object' => 'list', 'data' => []];
        for ($i = 0; $i < 5001; $i++) {
            $page['data'][] = ['id' => "m{$i}", 'owned_by' => 'openai'];
        }
        Http::fake(['api.openai.test/v1/models' => Http::response($page)]);

        $envelope = $this->service()->discoverDraft(['provider' => 'openai', 'base_url' => 'https://api.openai.test/v1', 'secret' => 'sk']);

        self::assertFalse($envelope['complete']);
        self::assertLessThanOrEqual(5000, count($envelope['models']));
        self::assertNotEmpty($envelope['warnings']);
    }
}
