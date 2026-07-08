<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosMessageApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_messages_can_be_created_and_listed_for_a_session(): void
    {
        $session = TalosSession::query()->create([
            'title' => 'Message session',
            'mode' => 'verified_execution',
        ]);

        $createResponse = $this->postJson('/api/talos/sessions/' . $session->id . '/messages', [
            'role' => 'user',
            'content' => 'Summarize this trace.',
            'model_profile_id' => 'profile-1',
            'run_id' => 'run-1',
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

    public function test_deleting_a_session_deletes_its_messages(): void
    {
        $session = TalosSession::query()->create([
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
