<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosModelRoutingApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();

        config([
            'services.avm_validator.url' => 'http://validator.test',
            'services.talos.model_provider_allowed_hosts' => [
                'api.openai.test',
                'api.openai.com',
            ],
        ]);
    }

    public function test_user_can_create_and_list_a_three_lane_model_routing_profile_without_secret_leak(): void
    {
        $planner = $this->profile('Planner', 'gpt-5.1-planner', 'planner-secret');
        $critic = $this->profile('Critic', 'gpt-5.1-critic', 'critic-secret');
        $executor = $this->profile('Executor', 'gpt-5.1-executor', 'executor-secret');

        $response = $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'ONEUP triple route',
            'task_type' => 'chat',
            'lanes' => [
                ['model_profile_id' => $planner->id, 'role' => 'planner', 'weight' => 45],
                ['model_profile_id' => $critic->id, 'role' => 'critic', 'weight' => 25],
                ['model_profile_id' => $executor->id, 'role' => 'executor', 'weight' => 30],
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.name', 'ONEUP triple route')
            ->assertJsonPath('data.lanes.0.model_profile_id', $planner->id)
            ->assertJsonPath('data.lanes.0.role', 'planner')
            ->assertJsonPath('data.lanes.1.model.provider', 'openai')
            ->assertJsonMissing(['planner-secret'])
            ->assertJsonMissing(['critic-secret'])
            ->assertJsonMissing(['executor-secret']);

        $routingProfileId = $response->json('data.id');
        $this->assertIsString($routingProfileId);
        $this->assertDatabaseHas('talos_model_routing_profiles', [
            'id' => $routingProfileId,
            'user_id' => $this->user->id,
            'name' => 'ONEUP triple route',
            'status' => 'enabled',
        ]);

        $this->getJson('/api/talos/model-routing-profiles')
            ->assertOk()
            ->assertJsonPath('data.0.id', $routingProfileId)
            ->assertJsonMissing(['planner-secret']);
    }

    public function test_routing_profile_rejects_cross_user_disabled_and_uncredentialed_lanes(): void
    {
        $owned = $this->profile('Owned', 'gpt-5.1-owned', 'owned-secret');
        $otherUser = User::factory()->create();
        $foreign = $this->profile('Foreign', 'gpt-5.1-foreign', 'foreign-secret', 'healthy', $otherUser);
        $disabled = $this->profile('Disabled', 'gpt-5.1-disabled', 'disabled-secret', 'disabled');
        $noSecret = $this->profile('No Secret', 'gpt-5.1-no-secret', null);

        $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'Unsafe route',
            'lanes' => [
                ['model_profile_id' => $owned->id, 'role' => 'planner', 'weight' => 50],
                ['model_profile_id' => $foreign->id, 'role' => 'critic', 'weight' => 50],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['lanes']);

        $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'Disabled route',
            'lanes' => [
                ['model_profile_id' => $disabled->id, 'role' => 'planner', 'weight' => 50],
                ['model_profile_id' => $owned->id, 'role' => 'executor', 'weight' => 50],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['lanes']);

        $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'Uncredentialed route',
            'lanes' => [
                ['model_profile_id' => $owned->id, 'role' => 'planner', 'weight' => 50],
                ['model_profile_id' => $noSecret->id, 'role' => 'executor', 'weight' => 50],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['lanes']);
    }

    public function test_chat_with_model_routing_profile_records_contribution_metadata_and_events(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Routing bridge',
            'mode' => 'verified_execution',
        ]);
        $planner = $this->profile('Planner', 'gpt-5.1-planner', 'planner-secret');
        $critic = $this->profile('Critic', 'gpt-5.1-critic', 'critic-secret');

        $routing = $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'Two-lane route',
            'lanes' => [
                ['model_profile_id' => $planner->id, 'role' => 'planner', 'weight' => 70],
                ['model_profile_id' => $critic->id, 'role' => 'critic', 'weight' => 30],
            ],
        ])->assertCreated()->json('data');

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Routed response',
            ]),
        ]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'message' => 'Route this through the team.',
            'model_routing_profile_id' => $routing['id'],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('text', 'Routed response')
            ->assertJsonPath('model_routing.profile_id', $routing['id'])
            ->assertJsonPath('model_routing.lanes.0.model_profile_id', $planner->id)
            ->assertJsonPath('model_routing.lanes.0.role', 'planner')
            ->assertJsonPath('run.metadata.model_routing.profile_id', $routing['id'])
            ->assertJsonPath('run.metadata.model_routing.lanes.1.model_profile_id', $critic->id)
            ->assertJsonMissing(['planner-secret'])
            ->assertJsonMissing(['critic-secret']);

        $runId = $response->json('run.id');
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_runs', [
            'id' => $runId,
            'session_id' => $session->id,
            'model_profile_id' => $planner->id,
            'provider' => 'openai',
            'model' => 'gpt-5.1-planner',
            'status' => 'succeeded',
        ]);

        $events = TalosRunEvent::query()
            ->where('run_id', $runId)
            ->orderBy('sequence')
            ->get();

        $this->assertSame([
            'chat.requested',
            'chat.model_contribution',
            'chat.model_contribution',
            'chat.response',
        ], $events->pluck('event_type')->all());
        $this->assertSame($routing['id'], $events[0]->payload['model_routing_profile_id'] ?? null);
        $this->assertSame('planner', $events[1]->payload['role'] ?? null);
        $this->assertSame('critic', $events[2]->payload['role'] ?? null);

        Http::assertSent(fn ($request): bool => $request->url() === 'http://validator.test/chat'
            && $request['api_key'] === 'planner-secret'
            && $request['provider'] === 'openai'
            && $request['model'] === 'gpt-5.1-planner'
            && is_array($request['model_routing'] ?? null)
            && $request['model_routing']['profile_id'] === $routing['id']);
    }

    public function test_chat_rejects_ambiguous_single_profile_and_routing_profile_selection(): void
    {
        $planner = $this->profile('Planner', 'gpt-5.1-planner', 'planner-secret');
        $critic = $this->profile('Critic', 'gpt-5.1-critic', 'critic-secret');

        $routing = $this->postJson('/api/talos/model-routing-profiles', [
            'name' => 'Two-lane route',
            'lanes' => [
                ['model_profile_id' => $planner->id, 'role' => 'planner', 'weight' => 70],
                ['model_profile_id' => $critic->id, 'role' => 'critic', 'weight' => 30],
            ],
        ])->assertCreated()->json('data');

        $this->postJson('/api/talos/chat', [
            'message' => 'Ambiguous model selection.',
            'model_profile_id' => $planner->id,
            'model_routing_profile_id' => $routing['id'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['model_routing_profile_id']);

        Http::assertNothingSent();
    }

    private function profile(
        string $displayName,
        string $model,
        ?string $secret,
        string $status = 'healthy',
        ?User $user = null,
    ): TalosModelProfile {
        $profile = TalosModelProfile::query()->create([
            'user_id' => ($user ?? $this->user)->id,
            'provider' => 'openai',
            'model' => $model,
            'display_name' => $displayName,
            'status' => $status,
            'encrypted_secret' => $secret !== null ? Crypt::encryptString($secret) : null,
            'base_url' => 'https://api.openai.test/v1',
        ]);
        assert($profile instanceof TalosModelProfile);

        return $profile;
    }
}
