<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosSession;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosPromptEnhancementTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $allowedHosts = [
            'api.openai.com',
            'api.deepseek.com',
            'api.anthropic.com',
            'generativelanguage.googleapis.com',
            'openrouter.ai',
            'ollama.example',
        ];
        config(['services.talos.model_provider_allowed_hosts' => $allowedHosts]);
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            $allowedHosts,
            static fn (string $host): array => ['93.184.216.34'],
        );
        $this->app->instance(PublicHttpRequestPinning::class, new PublicHttpRequestPinning(
            $policy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ));
    }

    public function test_prompt_enhancement_returns_controlled_unavailable_without_a_usable_profile(): void
    {
        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Summarize the incident notes.',
        ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_UNAVAILABLE');
    }

    public function test_prompt_enhancement_calls_selected_server_side_model_without_persisting_chat_messages_or_leaking_secrets(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'enhanced_prompt' => 'Investigate the reported bug, identify the root cause, implement the smallest safe fix, and verify it with focused regression tests.',
                            'summary' => 'Adds scope, constraints, and verification criteria.',
                            'applied_principles' => ['Explicit objective', 'Bounded scope', 'Acceptance checks'],
                        ], JSON_THROW_ON_ERROR),
                    ],
                ]],
            ]),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);
        $session = TalosSession::query()->create([
            'user_id' => auth()->id(),
            'title' => 'Scratch session',
            'mode' => 'verified_execution',
        ]);

        $response = $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Fix the bug',
            'model_profile_id' => $profile->id,
            'session_id' => $session->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.model_profile_id', $profile->id)
            ->assertJsonPath('data.provider', 'openai')
            ->assertJsonPath('data.model', 'gpt-test')
            ->assertJsonPath('data.original_prompt', 'Fix the bug')
            ->assertJsonPath('data.enhancement_mode', 'model')
            ->assertJsonPath('data.enhanced_prompt', 'Investigate the reported bug, identify the root cause, implement the smallest safe fix, and verify it with focused regression tests.')
            ->assertJsonPath('data.summary', 'Adds scope, constraints, and verification criteria.')
            ->assertJsonPath('data.applied_principles.2', 'Acceptance checks');

        $this->assertStringNotContainsString('server-side-secret', $response->getContent());
        $this->assertSame(0, DB::table('talos_messages')->count());

        Http::assertSentCount(1);
        Http::assertSent(function ($request): bool {
            $payload = $request->data();
            $encodedPayload = json_encode($payload, JSON_THROW_ON_ERROR);

            return $request->url() === 'https://api.openai.com/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer server-side-secret')
                && data_get($payload, 'model') === 'gpt-test'
                && data_get($payload, 'response_format.type') === 'json_object'
                && str_contains((string) data_get($payload, 'messages.0.content'), 'JSON')
                && str_contains((string) data_get($payload, 'messages.1.content'), 'Fix the bug')
                && ! str_contains($encodedPayload, 'server-side-secret');
        });
    }

    public function test_prompt_enhancement_supports_anthropic_response_shape_and_headers(): void
    {
        Http::fake([
            'api.anthropic.com/v1/messages' => Http::response([
                'content' => [[
                    'type' => 'text',
                    'text' => "```json\n{\"enhanced_prompt\":\"Produce a concise incident summary with a timeline, impact assessment, and three evidence-backed follow-up actions.\",\"summary\":\"Adds an output contract.\",\"applied_principles\":[\"Output structure\",\"Evidence\"]}\n```",
                ]],
            ]),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'anthropic',
            'model' => 'claude-test',
            'display_name' => 'Anthropic test',
            'encrypted_secret' => Crypt::encryptString('anthropic-server-secret'),
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Summarize the incident',
            'model_profile_id' => $profile->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.enhancement_mode', 'model')
            ->assertJsonPath('data.provider', 'anthropic')
            ->assertJsonPath('data.enhanced_prompt', 'Produce a concise incident summary with a timeline, impact assessment, and three evidence-backed follow-up actions.')
            ->assertJsonPath('data.applied_principles.1', 'Evidence')
            ->assertJsonMissing(['anthropic-server-secret']);

        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.anthropic.com/v1/messages'
            && $request->hasHeader('x-api-key', 'anthropic-server-secret')
            && $request->hasHeader('anthropic-version', '2023-06-01')
            && ! $request->hasHeader('Authorization')
            && data_get($request->data(), 'model') === 'claude-test'
            && is_string(data_get($request->data(), 'system')));
    }

    public function test_prompt_enhancement_supports_secretless_trusted_local_ollama_profile(): void
    {
        Http::fake([
            '127.0.0.1:11434/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '{"enhanced_prompt":"Explain the failure using the supplied logs, cite the causal line, and propose a verified remediation.","summary":"Adds evidence requirements.","applied_principles":["Grounding"]}',
                    ],
                ]],
            ]),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'ollama',
            'model' => 'llama3.1',
            'display_name' => 'Local Ollama',
            'base_url' => 'http://127.0.0.1:11434/v1',
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Explain this failure',
            'model_profile_id' => $profile->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.provider', 'ollama')
            ->assertJsonPath('data.enhancement_mode', 'model')
            ->assertJsonPath('data.applied_principles.0', 'Grounding');

        Http::assertSent(fn ($request): bool => $request->url() === 'http://127.0.0.1:11434/v1/chat/completions'
            && ! $request->hasHeader('Authorization'));
    }

    public function test_prompt_enhancement_fails_closed_for_private_remote_provider_url(): void
    {
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Unsafe provider',
            'encrypted_secret' => Crypt::encryptString('private-provider-secret'),
            'base_url' => 'http://127.0.0.1:8080/v1',
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_BASE_URL_BLOCKED')
            ->assertJsonMissing(['private-provider-secret']);

        Http::assertNothingSent();
    }

    public function test_prompt_enhancement_rejects_unallowlisted_public_host_before_secret_decryption(): void
    {
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Unlisted provider',
            'encrypted_secret' => 'malformed-ciphertext',
            'base_url' => 'https://public-but-unlisted.example/v1',
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_BASE_URL_BLOCKED')
            ->assertJsonMissing(['malformed-ciphertext']);

        Http::assertNothingSent();
    }

    public function test_prompt_enhancement_rejects_remote_ollama_even_when_host_is_allowlisted(): void
    {
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'ollama',
            'model' => 'llama3.1',
            'display_name' => 'Remote Ollama',
            'base_url' => 'https://ollama.example/v1',
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_BASE_URL_BLOCKED');

        Http::assertNothingSent();
    }

    public function test_prompt_enhancement_rejects_malformed_model_output_with_a_controlled_fault(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => 'not valid JSON']]],
            ]),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_INVALID_RESPONSE')
            ->assertJsonMissing(['not valid JSON'])
            ->assertJsonMissing(['server-side-secret']);
    }

    public function test_prompt_enhancement_redacts_provider_failures(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'error' => ['message' => 'invalid key server-side-secret'],
            ], 401),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_PROVIDER_AUTH_FAILED')
            ->assertJsonPath('error.retryable', false)
            ->assertJsonMissing(['invalid key server-side-secret'])
            ->assertJsonMissing(['server-side-secret']);
    }

    public function test_prompt_enhancement_rejects_provider_redirects_without_following_them(): void
    {
        $seenOptions = null;
        Http::fake(function (Request $request, array $options) use (&$seenOptions) {
            $seenOptions = $options;

            return Http::response(null, 302, ['Location' => 'https://attacker.example/collect']);
        });

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Redirecting provider',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_REDIRECT_BLOCKED')
            ->assertJsonMissing(['server-side-secret']);

        $this->assertIsArray($seenOptions);
        $this->assertSame(false, $seenOptions['allow_redirects']);
    }

    public function test_prompt_enhancement_rejects_raw_client_secrets(): void
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);

        $response = $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
            'api_key' => 'client-secret',
            'secret' => 'another-client-secret',
            'encrypted_secret' => 'encrypted-client-secret',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['api_key', 'secret', 'encrypted_secret']);

        $this->assertStringNotContainsString('client-secret', $response->getContent());
        $this->assertStringNotContainsString('another-client-secret', $response->getContent());
        $this->assertStringNotContainsString('encrypted-client-secret', $response->getContent());
    }

    public function test_prompt_enhancement_rejects_a_foreign_session_before_calling_the_provider(): void
    {
        Http::fake();

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);
        $foreignSession = TalosSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Foreign session',
            'mode' => 'verified_execution',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
            'session_id' => $foreignSession->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['session_id'])
            ->assertJsonMissing(['server-side-secret']);

        Http::assertNothingSent();
    }

    public function test_prompt_enhancement_returns_a_retryable_fault_when_provider_connection_fails(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::failedConnection(),
        ]);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'OpenAI test',
            'encrypted_secret' => Crypt::encryptString('server-side-secret'),
            'status' => 'healthy',
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $profile->id,
        ])
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_PROVIDER_UNAVAILABLE')
            ->assertJsonPath('error.retryable', true)
            ->assertJsonMissing(['server-side-secret']);
    }

    public function test_prompt_enhancement_does_not_use_foreign_model_profiles(): void
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

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
            'model_profile_id' => $foreignProfile->id,
        ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_UNAVAILABLE')
            ->assertJsonMissing(['foreign-secret']);
    }

    public function test_prompt_enhancement_uses_only_the_current_users_default_profile(): void
    {
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '{"enhanced_prompt":"Improve this prompt with an explicit deliverable and acceptance checks.","summary":"Adds a contract.","applied_principles":["Acceptance checks"]}',
                    ],
                ]],
            ]),
        ]);

        $otherUser = User::factory()->create();
        $foreignProfile = TalosModelProfile::query()->create([
            'user_id' => $otherUser->id,
            'provider' => 'openai',
            'model' => 'gpt-foreign',
            'display_name' => 'Foreign default profile',
            'encrypted_secret' => Crypt::encryptString('foreign-default-secret'),
            'status' => 'healthy',
        ]);
        $ownedProfile = TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => 'openai',
            'model' => 'gpt-owned',
            'display_name' => 'Owned default profile',
            'encrypted_secret' => Crypt::encryptString('owned-default-secret'),
            'status' => 'healthy',
        ]);

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $otherUser->id),
            'user_id' => $otherUser->id,
            'default_model_profile_id' => $foreignProfile->id,
            'preferences' => ['theme' => 'paper'],
        ]);
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser((int) $this->user->id),
            'user_id' => $this->user->id,
            'default_model_profile_id' => $ownedProfile->id,
            'preferences' => ['theme' => 'terminal'],
        ]);

        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Improve this',
        ])
            ->assertOk()
            ->assertJsonPath('data.model_profile_id', $ownedProfile->id)
            ->assertJsonPath('data.model', 'gpt-owned')
            ->assertJsonPath('data.enhancement_mode', 'model')
            ->assertJsonMissing(['model_profile_id' => $foreignProfile->id])
            ->assertJsonMissing(['foreign-default-secret']);
    }
}
