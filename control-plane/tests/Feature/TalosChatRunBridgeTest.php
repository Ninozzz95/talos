<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosChatRunBridgeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_profile_backed_chat_creates_persisted_run_and_events_when_session_is_supplied(): void
    {
        config(['services.avm_validator.url' => 'http://validator.test']);

        $session = TalosSession::query()->create([
            'user_id' => auth()->id(),
            'title' => 'Run bridge',
            'mode' => 'verified_execution',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => auth()->id(),
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'OpenAI Work',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('profile-secret'),
        ]);

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Run-backed response',
                'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'read_file', 'node_type' => 'READ_FILE'],
                ],
                'dag' => 'Node: read_file | Type: READ_FILE | Status: SUCCESS | Result: ok',
            ]),
        ]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'message' => 'Build a replayable plan.',
            'model_profile_id' => $profile->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('text', 'Run-backed response')
            ->assertJsonPath('run.status', 'succeeded')
            ->assertJsonPath('run.session_id', $session->id)
            ->assertJsonPath('run.model_profile_id', $profile->id);

        $runId = $response->json('run.id');
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_runs', [
            'id' => $runId,
            'session_id' => $session->id,
            'status' => 'succeeded',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 1,
            'event_type' => 'chat.requested',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 2,
            'event_type' => 'chat.response',
        ]);
        $this->assertDatabaseCount('talos_messages', 0);
    }

    public function test_profile_backed_chat_marks_persisted_run_failed_when_validator_fails(): void
    {
        config(['services.avm_validator.url' => 'http://validator.test']);

        $session = TalosSession::query()->create([
            'user_id' => auth()->id(),
            'title' => 'Run bridge failure',
            'mode' => 'verified_execution',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => auth()->id(),
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'OpenAI Work',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('profile-secret'),
        ]);

        Http::fake([
            'validator.test/chat' => Http::response(['error' => 'validator rejected'], 500),
        ]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'message' => 'Build a replayable plan.',
            'model_profile_id' => $profile->id,
        ]);

        $response
            ->assertStatus(502)
            ->assertJsonPath('run.status', 'failed')
            ->assertJsonPath('run.session_id', $session->id);

        $runId = $response->json('run.id');
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_runs', [
            'id' => $runId,
            'session_id' => $session->id,
            'status' => 'failed',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 1,
            'event_type' => 'chat.requested',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 2,
            'event_type' => 'chat.failed',
        ]);
        $this->assertDatabaseCount('talos_messages', 0);
    }
}
