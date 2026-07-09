<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSession;
use App\Models\TalosRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosMessageApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_messages_can_be_created_and_listed_for_a_session(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Message session',
            'mode' => 'verified_execution',
        ]);
        $run = TalosRun::query()->create([
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'message session prompt'),
        ]);

        $createResponse = $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'user',
            'content' => 'Summarize this trace.',
            'model_profile_id' => 'profile-1',
            'run_id' => $run->id,
            'metadata' => ['client_message_id' => 'local-1'],
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('data.session_id', $session->id)
            ->assertJsonPath('data.role', 'user')
            ->assertJsonPath('data.content', 'Summarize this trace.')
            ->assertJsonPath('data.metadata.client_message_id', 'local-1');

        $messageId = $createResponse->json('data.id');

        $this->getJson('/api/talos/sessions/' . $session->id . '/messages')
            ->assertOk()
            ->assertJsonPath('data.0.id', $messageId)
            ->assertJsonPath('data.0.role', 'user')
            ->assertJsonPath('data.0.content', 'Summarize this trace.');
    }

    public function test_message_validation_rejects_invalid_payloads(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Validation session',
            'mode' => 'verified_execution',
        ]);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'invalid',
            'content' => '',
            'metadata' => 'not-json-object',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['role', 'content', 'metadata']);
    }

    public function test_message_run_id_must_belong_to_the_session(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Run linked session',
            'mode' => 'verified_execution',
        ]);
        $otherSession = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other session',
            'mode' => 'verified_execution',
        ]);
        $run = TalosRun::query()->create([
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'run linked prompt'),
        ]);
        $otherRun = TalosRun::query()->create([
            'session_id' => $otherSession->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'other prompt'),
        ]);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'assistant',
            'content' => 'A linked answer.',
            'run_id' => $run->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.run_id', $run->id);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'assistant',
            'content' => 'A forged run reference.',
            'run_id' => $otherRun->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id']);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'assistant',
            'content' => 'A missing run reference.',
            'run_id' => 'run-does-not-exist',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id']);
    }

    public function test_message_action_metadata_references_must_stay_inside_the_session_and_reject_secret_fields(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Action metadata session',
            'mode' => 'verified_execution',
        ]);
        $otherSession = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other action metadata session',
            'mode' => 'verified_execution',
        ]);

        $originalMessageId = $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'user',
            'content' => 'Original prompt.',
        ])
            ->assertCreated()
            ->json('data.id');

        $otherMessage = $otherSession->messages()->create([
            'role' => 'user',
            'content' => 'Foreign prompt.',
        ]);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'user',
            'content' => 'Retry prompt.',
            'metadata' => [
                'source' => 'talos_chat_page',
                'command_id' => 'retry_assistant_response',
                'retry_of_message_id' => $originalMessageId,
                'resend_of_message_id' => $originalMessageId,
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.metadata.command_id', 'retry_assistant_response')
            ->assertJsonPath('data.metadata.retry_of_message_id', $originalMessageId)
            ->assertJsonPath('data.metadata.resend_of_message_id', $originalMessageId);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'user',
            'content' => 'Cross-session retry prompt.',
            'metadata' => [
                'retry_of_message_id' => $otherMessage->id,
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['metadata.retry_of_message_id']);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'system',
            'content' => 'Leaky metadata.',
            'metadata' => [
                'nested' => [
                    'access_tokens' => 'should-not-persist',
                    'access_token_value' => 'should-not-persist',
                    'api_tokens' => 'should-not-persist',
                    'token_hash_value' => 'should-not-persist',
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['metadata']);

        $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'assistant',
            'content' => 'Usage metadata.',
            'metadata' => [
                'usage' => [
                    'input_tokens' => 120,
                    'output_tokens' => 40,
                    'total_tokens' => 160,
                    'token_estimate' => 170,
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.metadata.usage.input_tokens', 120)
            ->assertJsonPath('data.metadata.usage.total_tokens', 160);
    }

    public function test_messages_are_scoped_to_sessions_owned_by_the_authenticated_user(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $foreignSession = TalosSession::query()->create([
            'user_id' => $other->id,
            'title' => 'Foreign session',
            'mode' => 'verified_execution',
        ]);

        $foreignMessage = $foreignSession->messages()->create([
            'role' => 'user',
            'content' => 'Private foreign prompt.',
        ]);

        $this->actingAs($owner);

        $this->getJson('/api/talos/sessions/' . $foreignSession->id . '/messages')
            ->assertNotFound()
            ->assertJsonMissing(['Private foreign prompt.']);

        $this->postJson('/api/talos/sessions/' . $foreignSession->id . '/messages', [
            'role' => 'assistant',
            'content' => 'Injected into someone else session.',
        ])
            ->assertNotFound();

        $this->assertDatabaseHas('talos_messages', [
            'id' => $foreignMessage->id,
            'session_id' => $foreignSession->id,
            'content' => 'Private foreign prompt.',
        ]);

        $this->assertDatabaseMissing('talos_messages', [
            'session_id' => $foreignSession->id,
            'content' => 'Injected into someone else session.',
        ]);
    }

    public function test_deleting_a_session_deletes_its_messages(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Cascade session',
            'mode' => 'verified_execution',
        ]);

        $messageId = $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'assistant',
            'content' => 'A persisted answer.',
        ])
            ->assertCreated()
            ->json('data.id');

        $this->deleteJson('/api/talos/sessions/' . $session->id)
            ->assertNoContent();

        $this->assertDatabaseMissing('talos_messages', [
            'id' => $messageId,
        ]);
    }
}
