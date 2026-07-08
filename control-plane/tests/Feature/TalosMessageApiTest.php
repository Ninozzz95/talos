<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSession;
use App\Models\TalosRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosMessageApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_messages_can_be_created_and_listed_for_a_session(): void
    {
        $session = TalosSession::query()->create([
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
            'title' => 'Run linked session',
            'mode' => 'verified_execution',
        ]);
        $otherSession = TalosSession::query()->create([
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
