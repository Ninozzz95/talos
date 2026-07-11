<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosModelProfile;
use App\Models\User;
use App\Services\Models\TalosModelProbeService;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosModelProfileApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();

        $allowedHosts = [
            'api.openai.test',
            'api.deepseek.test',
            'api.openai.com',
            'api.deepseek.com',
            'api.anthropic.com',
            'generativelanguage.googleapis.com',
            'openrouter.ai',
            'approved.example',
            'ollama.example',
        ];
        config([
            'services.talos.model_provider_allowed_hosts' => $allowedHosts,
        ]);
        $this->app->instance(PublicHttpRequestPinning::class, new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                $allowedHosts,
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ));
        $this->app->bind(TalosModelProbeService::class, fn ($app) => new TalosModelProbeService(
            $app->make(PublicHttpRequestPinning::class),
        ));
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
        $this->assertSame($this->user->id, $profile->user_id);
    }

    public function test_create_cannot_establish_readiness_or_verified_capabilities_from_client_input(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Claimed ready',
            'secret' => 'sk-client-claim',
            'base_url' => 'https://api.openai.test/v1',
            'status' => 'healthy',
            'capabilities' => ['json' => true, 'tools' => true, 'remote' => true],
            'probe_result' => ['ok' => true, 'code' => 'CLIENT_CLAIMED_READY'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'untested')
            ->assertJsonPath('data.capabilities', null)
            ->assertJsonPath('data.probe_result', null);
    }

    public function test_list_and_show_omit_secret_fields(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
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

    public function test_model_profiles_are_scoped_to_the_authenticated_user(): void
    {
        $otherUser = User::factory()->create();
        $foreign = TalosModelProfile::query()->create([
            'user_id' => $otherUser->id,
            'provider' => 'openai',
            'model' => 'gpt-foreign',
            'display_name' => 'Foreign profile',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('foreign-secret'),
            'base_url' => 'https://api.openai.test/v1',
        ]);

        $createResponse = $this->postJson('/api/talos/model-profiles', [
            'user_id' => $otherUser->id,
            'provider' => 'openai',
            'model' => 'gpt-owned',
            'display_name' => 'Owned profile',
            'secret' => 'owned-secret',
            'base_url' => 'https://api.openai.test/v1',
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('data.user_id', $this->user->id);

        $ownedId = $createResponse->json('data.id');

        $this->getJson('/api/talos/model-profiles')
            ->assertOk()
            ->assertJsonFragment(['id' => $ownedId])
            ->assertJsonMissing(['id' => $foreign->id])
            ->assertJsonMissing(['foreign-secret']);

        $this->getJson("/api/talos/model-profiles/{$foreign->id}")
            ->assertNotFound();

        $this->patchJson("/api/talos/model-profiles/{$foreign->id}", [
            'display_name' => 'Hijacked profile',
        ])->assertNotFound();

        $this->postJson("/api/talos/model-profiles/{$foreign->id}/probe")
            ->assertNotFound();

        $this->deleteJson("/api/talos/model-profiles/{$foreign->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('talos_model_profiles', [
            'id' => $foreign->id,
            'user_id' => $otherUser->id,
            'display_name' => 'Foreign profile',
        ]);
    }

    public function test_update_without_secret_preserves_existing_secret(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
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

    public function test_update_cannot_establish_readiness_or_verified_capabilities_from_client_input(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Not probed',
            'encrypted_secret' => Crypt::encryptString('original-secret'),
            'status' => 'untested',
        ]);

        $this->patchJson("/api/talos/model-profiles/{$profile->id}", [
            'status' => 'healthy',
            'capabilities' => ['json' => true, 'tools' => true, 'remote' => true],
            'probe_result' => ['ok' => true, 'code' => 'CLIENT_CLAIMED_READY'],
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'untested')
            ->assertJsonPath('data.capabilities', null)
            ->assertJsonPath('data.probe_result', null);
    }

    public function test_update_applies_disabled_status_when_connection_identity_is_unchanged(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Disable me',
            'encrypted_secret' => Crypt::encryptString('original-secret'),
            'base_url' => 'https://api.openai.test/v1',
            'status' => 'healthy',
            'capabilities' => ['chat' => true],
            'probe_result' => ['ok' => true],
        ]);

        $this->patchJson("/api/talos/model-profiles/{$profile->id}", [
            'status' => 'disabled',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'disabled')
            ->assertJsonPath('data.capabilities.chat', true)
            ->assertJsonPath('data.probe_result.ok', true);
    }

    public function test_update_with_unchanged_secret_preserves_probe_evidence(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1',
            'display_name' => 'Keep probe',
            'encrypted_secret' => Crypt::encryptString('original-secret'),
            'base_url' => 'https://api.openai.test/v1',
            'status' => 'healthy',
            'capabilities' => ['chat' => true],
            'probe_result' => ['ok' => true, 'probe_id' => 'existing'],
        ]);

        $this->patchJson("/api/talos/model-profiles/{$profile->id}", [
            'secret' => 'original-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.capabilities.chat', true)
            ->assertJsonPath('data.probe_result.probe_id', 'existing');
    }

    public function test_connection_identity_changes_invalidate_prior_probe_evidence(): void
    {
        foreach ([
            'provider' => ['provider' => 'deepseek'],
            'model' => ['model' => 'gpt-4.1-mini'],
            'base_url' => ['base_url' => 'https://api.openai.test/v2'],
            'secret' => ['secret' => 'rotated-secret'],
        ] as $field => $payload) {
            $profile = TalosModelProfile::query()->create([
                'user_id' => $this->user->id,
                'provider' => 'openai',
                'model' => 'gpt-4.1',
                'display_name' => "Probed {$field}",
                'encrypted_secret' => Crypt::encryptString('original-secret'),
                'base_url' => 'https://api.openai.test/v1',
                'status' => 'healthy',
                'capabilities' => ['chat' => true, 'tools' => true],
                'probe_result' => ['ok' => true, 'url' => 'https://api.openai.test/v1/chat/completions'],
            ]);

            $this->patchJson("/api/talos/model-profiles/{$profile->id}", $payload)
                ->assertOk()
                ->assertJsonPath('data.status', 'untested')
                ->assertJsonPath('data.capabilities', null)
                ->assertJsonPath('data.probe_result', null);

            $profile->refresh();
            $this->assertSame('untested', $profile->status, $field);
            $this->assertNull($profile->capabilities, $field);
            $this->assertNull($profile->probe_result, $field);
        }
    }

    public function test_update_with_secret_rotates_secret_without_returning_it(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
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

    public function test_provider_catalog_defaults_are_applied_server_side(): void
    {
        $response = $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openrouter',
            'secret' => 'sk-openrouter-secret',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.provider', 'openrouter')
            ->assertJsonPath('data.display_name', 'OpenRouter')
            ->assertJsonPath('data.model', 'openai/gpt-4.1-mini')
            ->assertJsonPath('data.base_url', 'https://openrouter.ai/api/v1')
            ->assertJsonPath('data.timeout_seconds', 60)
            ->assertJsonPath('data.has_secret', true)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');

        $profile = TalosModelProfile::query()->firstOrFail();

        $this->assertSame('sk-openrouter-secret', Crypt::decryptString((string) $profile->encrypted_secret));
    }

    public function test_model_timeout_can_be_overridden_and_is_validated(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'secret' => 'sk-timeout-secret',
            'timeout_seconds' => 45,
        ])
            ->assertCreated()
            ->assertJsonPath('data.timeout_seconds', 45)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');

        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'secret' => 'sk-timeout-secret',
            'timeout_seconds' => 3,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['timeout_seconds'])
            ->assertJsonMissing(['sk-timeout-secret']);
    }

    public function test_draft_probe_uses_catalog_defaults_without_storing_profile(): void
    {
        Http::fake([
            'openrouter.ai/api/v1/chat/completions' => Http::response(['id' => 'draft-probe-ok'], 200),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'openrouter',
            'secret' => 'sk-draft-probe',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.result.ok', true)
            ->assertJsonMissing(['sk-draft-probe']);

        $this->assertSame(0, TalosModelProfile::query()->count());
        Http::assertSent(fn ($request): bool => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer sk-draft-probe'));
    }

    public function test_draft_probe_normalizes_openai_compatible_base_url_without_duplicate_chat_path(): void
    {
        Http::fake([
            'api.deepseek.test/v1/chat/completions' => Http::response(['id' => 'normalized-probe-ok'], 200),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'deepseek',
            'secret' => 'sk-deepseek-secret',
            'base_url' => 'https://api.deepseek.test/v1/chat/completions/',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.result.ok', true)
            ->assertJsonPath('data.result.url', 'https://api.deepseek.test/v1/chat/completions')
            ->assertJsonMissing(['sk-deepseek-secret']);

        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.deepseek.test/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer sk-deepseek-secret'));
    }

    public function test_draft_probe_returns_structured_provider_failure_without_leaking_secret(): void
    {
        Http::fake([
            'api.deepseek.test/v1/chat/completions' => Http::response([
                'error' => [
                    'message' => 'invalid api key sk-deepseek-secret',
                    'type' => 'authentication_error',
                ],
            ], 401),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'deepseek',
            'secret' => 'sk-deepseek-secret',
            'base_url' => 'https://api.deepseek.test/v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'degraded')
            ->assertJsonPath('data.result.ok', false)
            ->assertJsonPath('data.result.code', 'PROVIDER_HTTP_ERROR')
            ->assertJsonPath('data.result.message', 'Provider returned HTTP 401 during probe.')
            ->assertJsonPath('data.result.provider', 'deepseek')
            ->assertJsonPath('data.result.base_url_policy.allowed', true)
            ->assertJsonPath('data.result.provider_response_excerpt', '{"error":{"message":"invalid api key [redacted]","type":"authentication_error"}}')
            ->assertJsonMissing(['sk-deepseek-secret']);
    }

    public function test_draft_probe_redacts_exact_submitted_secret_from_provider_preview(): void
    {
        Http::fake([
            'api.openai.test/v1/chat/completions' => Http::response('provider echoed plain-provider-secret-42 in a proxy error', 502),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'openai',
            'secret' => 'plain-provider-secret-42',
            'base_url' => 'https://api.openai.test/v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'degraded')
            ->assertJsonPath('data.result.body_preview', 'provider echoed [redacted] in a proxy error')
            ->assertJsonPath('data.result.provider_response_excerpt', 'provider echoed [redacted] in a proxy error')
            ->assertJsonMissing(['plain-provider-secret-42']);
    }

    public function test_draft_probe_redacts_short_submitted_secret_from_provider_preview(): void
    {
        Http::fake([
            'api.openai.test/v1/chat/completions' => Http::response('provider echoed abc in a proxy error', 502),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'openai',
            'secret' => 'abc',
            'base_url' => 'https://api.openai.test/v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'degraded')
            ->assertJsonPath('data.result.body_preview', 'provider echoed [redacted] in a proxy error')
            ->assertJsonPath('data.result.provider_response_excerpt', 'provider echoed [redacted] in a proxy error')
            ->assertJsonMissing(['abc']);
    }

    public function test_provider_catalog_accepts_anthropic_and_gemini_without_client_side_defaults(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'anthropic',
            'secret' => 'anthropic-secret',
        ])
            ->assertCreated()
            ->assertJsonPath('data.provider', 'anthropic')
            ->assertJsonPath('data.model', 'claude-sonnet')
            ->assertJsonPath('data.base_url', 'https://api.anthropic.com/v1');

        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'gemini',
            'secret' => 'gemini-secret',
        ])
            ->assertCreated()
            ->assertJsonPath('data.provider', 'gemini')
            ->assertJsonPath('data.model', 'gemini-2.5-flash')
            ->assertJsonPath('data.base_url', 'https://generativelanguage.googleapis.com/v1beta/openai');
    }

    public function test_ollama_local_profile_requires_no_secret_and_never_stores_a_bearer_token(): void
    {
        $response = $this->postJson('/api/talos/model-profiles', [
            'provider' => 'ollama',
            'base_url' => 'http://127.0.0.1:11434/v1',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.provider', 'ollama')
            ->assertJsonPath('data.display_name', 'Ollama Local')
            ->assertJsonPath('data.model', 'llama3.1')
            ->assertJsonPath('data.base_url', 'http://127.0.0.1:11434/v1')
            ->assertJsonPath('data.has_secret', false)
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.encrypted_secret');

        $profile = TalosModelProfile::query()->firstOrFail();

        $this->assertNull($profile->encrypted_secret);
    }

    public function test_public_provider_host_outside_allowlist_is_rejected_without_storage_or_audit(): void
    {
        $auditCount = TalosAuditEvent::query()->count();

        $response = $this->postJson('/api/talos/model-profiles', [
            'provider' => 'openai',
            'model' => 'gpt-unlisted',
            'secret' => 'never-store-this-secret',
            'base_url' => 'https://public-but-unlisted.example/v1',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['base_url']);
        $this->assertStringNotContainsString('never-store-this-secret', $response->getContent());
        $this->assertDatabaseCount('talos_model_profiles', 0);
        $this->assertSame($auditCount, TalosAuditEvent::query()->count());
    }

    public function test_model_profile_base_url_rejects_userinfo_query_and_fragment_without_token_leakage(): void
    {
        $urls = [
            'https://user:url-token@api.openai.com/v1',
            'https://api.openai.com/v1?api_key=url-token',
            'https://api.openai.com/v1#url-token',
        ];
        $auditCount = TalosAuditEvent::query()->count();

        foreach ($urls as $url) {
            $response = $this->postJson('/api/talos/model-profiles', [
                'provider' => 'openai',
                'model' => 'gpt-unsafe-url',
                'secret' => 'profile-secret',
                'base_url' => $url,
            ]);

            $response
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['base_url']);
            $this->assertStringNotContainsString('url-token', $response->getContent());
        }

        $this->assertDatabaseCount('talos_model_profiles', 0);
        $this->assertSame($auditCount, TalosAuditEvent::query()->count());
    }

    public function test_ollama_non_loopback_url_is_rejected_even_when_public_and_allowlisted(): void
    {
        $this->postJson('/api/talos/model-profiles', [
            'provider' => 'ollama',
            'model' => 'llama3.1',
            'base_url' => 'https://ollama.example/v1',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['base_url']);

        $this->assertDatabaseCount('talos_model_profiles', 0);
    }

    public function test_ollama_draft_probe_uses_local_endpoint_without_bearer_token(): void
    {
        Http::fake([
            '127.0.0.1:11434/v1/chat/completions' => Http::response(['id' => 'ollama-ok'], 200),
        ]);

        $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'ollama',
            'base_url' => 'http://127.0.0.1:11434/v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.result.ok', true)
            ->assertJsonMissing(['Authorization']);

        $this->assertSame(0, TalosModelProfile::query()->count());
        Http::assertSent(fn ($request): bool => $request->url() === 'http://127.0.0.1:11434/v1/chat/completions'
            && ! $request->hasHeader('Authorization'));
    }

    public function test_draft_probe_rejects_url_query_tokens_without_sending_or_echoing_them(): void
    {
        Http::fake();

        $response = $this->postJson('/api/talos/model-profiles/probe-draft', [
            'provider' => 'openai',
            'model' => 'gpt-query-token',
            'secret' => 'profile-secret',
            'base_url' => 'https://api.openai.com/v1?api_key=probe-url-token',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['base_url']);
        $this->assertStringNotContainsString('probe-url-token', $response->getContent());
        Http::assertNothingSent();
    }

    public function test_probe_rejects_database_injected_remote_ollama_without_sending_a_request(): void
    {
        Http::fake();
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'ollama',
            'model' => 'llama3.1',
            'display_name' => 'Remote Ollama',
            'base_url' => 'https://ollama.example/v1',
            'status' => 'untested',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.probe_result.ok', false)
            ->assertJsonPath('data.probe_result.code', 'BASE_URL_POLICY_BLOCKED');

        Http::assertNothingSent();
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
            'user_id' => $this->user->id,
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
            ->assertJsonPath('data.probe_result.code', 'BASE_URL_POLICY_BLOCKED')
            ->assertJsonPath('data.probe_result.provider', 'openai')
            ->assertJsonPath('data.probe_result.base_url_policy.allowed', false)
            ->assertJsonMissing(['private-secret']);

        Http::assertNothingSent();
    }

    public function test_probe_marks_profile_healthy_for_successful_json_response(): void
    {
        Http::fake([
            'api.openai.test/v1/chat/completions' => Http::response(['id' => 'probe-ok'], 200),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
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
            ->assertJsonPath('data.capabilities.json', true)
            ->assertJsonPath('data.capabilities.remote', true)
            ->assertJsonPath('data.capabilities.tools', false)
            ->assertJsonMissingPath('data.encrypted_secret');

        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.openai.test/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer probe-secret'));
    }

    public function test_probe_pins_dns_approved_public_ip_for_the_transport_connection(): void
    {
        $this->app->instance(PublicHttpRequestPinning::class, new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['approved.example'],
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ));
        $this->app->bind(TalosModelProbeService::class, fn ($app) => new TalosModelProbeService(
            $app->make(PublicHttpRequestPinning::class),
        ));

        $connectionOptions = [];
        Http::fake(function ($request, array $options) use (&$connectionOptions) {
            $connectionOptions = $options;

            return Http::response(['id' => 'pinned-probe'], 200);
        });

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Pinned probe',
            'encrypted_secret' => Crypt::encryptString('pinned-secret'),
            'base_url' => 'https://approved.example/v1',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'healthy');

        $this->assertSame(
            ['approved.example:443:93.184.216.34'],
            $connectionOptions['curl'][CURLOPT_RESOLVE] ?? null,
        );
    }

    public function test_probe_does_not_send_credentials_when_connection_pinning_is_unavailable(): void
    {
        $this->app->instance(PublicHttpRequestPinning::class, new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['approved.example'],
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: false,
        ));
        $this->app->bind(TalosModelProbeService::class, fn ($app) => new TalosModelProbeService(
            $app->make(PublicHttpRequestPinning::class),
        ));
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Unpinnable probe',
            'encrypted_secret' => Crypt::encryptString('do-not-send-this-secret'),
            'base_url' => 'https://approved.example/v1',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.probe_result.code', 'CONNECTION_PINNING_UNAVAILABLE')
            ->assertJsonMissing(['do-not-send-this-secret']);

        Http::assertNothingSent();
    }

    public function test_probe_marks_profile_degraded_for_non_success_response(): void
    {
        Http::fake([
            'api.deepseek.test/chat/completions' => Http::response(['error' => 'bad key'], 401),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
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

    public function test_probe_returns_a_controlled_failure_for_provider_redirects(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response(null, 302, [
                'Location' => 'https://attacker.example/collect',
            ]),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Redirecting probe',
            'encrypted_secret' => Crypt::encryptString('probe-secret'),
            'base_url' => 'https://api.openai.com/v1',
        ]);

        $this->postJson("/api/talos/model-profiles/{$profile->id}/probe")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.probe_result.code', 'PROVIDER_REDIRECT_BLOCKED')
            ->assertJsonPath('data.probe_result.http_status', 302)
            ->assertJsonMissing(['probe-secret']);
    }
}
