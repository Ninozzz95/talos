<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class TalosPromptEnhancementTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_prompt_enhancement_returns_controlled_unavailable_without_a_usable_profile(): void
    {
        $this->postJson('/api/talos/prompts/enhance', [
            'prompt' => 'Summarize the incident notes.',
        ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'PROMPT_ENHANCER_UNAVAILABLE');
    }

    public function test_prompt_enhancement_uses_server_side_profile_without_persisting_chat_messages_or_leaking_secrets(): void
    {
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
            ->assertJsonPath('data.original_prompt', 'Fix the bug')
            ->assertJsonPath('data.enhancement_mode', 'deterministic_template');

        $enhancedPrompt = $response->json('data.enhanced_prompt');
        $this->assertIsString($enhancedPrompt);
        $this->assertStringContainsString('Fix the bug', $enhancedPrompt);
        $this->assertStringNotContainsString('server-side-secret', $response->getContent());
        $this->assertSame(0, DB::table('talos_messages')->count());
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
}
