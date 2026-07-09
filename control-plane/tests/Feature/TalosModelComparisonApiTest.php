<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

final class TalosModelComparisonApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_blind_model_comparison_creates_redacted_lanes_and_runs(): void
    {
        $alpha = $this->profile('OpenAI Alpha', 'gpt-alpha');
        $beta = $this->profile('Anthropic Beta', 'claude-beta');

        $response = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Compare recovery options for a blocked DAG.',
            'mode' => 'blind',
            'task_type' => 'chat',
            'blind' => false,
            'timeout_seconds' => 45,
            'model_profile_ids' => [$alpha->id, $beta->id],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.mode', 'blind')
            ->assertJsonPath('data.blind', true)
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.lanes.0.display_alias', 'Model A')
            ->assertJsonPath('data.lanes.1.display_alias', 'Model B')
            ->assertJsonMissingPath('data.lanes.0.run_id')
            ->assertJsonMissingPath('data.lanes.1.run_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile')
            ->assertJsonMissingPath('data.lanes.1.model_profile_id')
            ->assertJsonMissing(['OpenAI Alpha', 'Anthropic Beta']);

        $comparisonId = $response->json('data.id');
        $this->assertIsString($comparisonId);

        $this->assertDatabaseHas('talos_model_comparisons', [
            'id' => $comparisonId,
            'user_id' => $this->user->id,
            'status' => 'completed',
            'blind' => true,
        ]);

        $laneProfileIds = \App\Models\TalosModelComparisonLane::query()
            ->where('comparison_id', $comparisonId)
            ->orderBy('position')
            ->pluck('model_profile_id')
            ->all();

        $this->assertNotSame([$alpha->id, $beta->id], $laneProfileIds);
        $this->assertEqualsCanonicalizing([$alpha->id, $beta->id], $laneProfileIds);

        $this->assertDatabaseHas('talos_runs', [
            'model_profile_id' => $alpha->id,
            'mode' => 'model_comparison_lane',
            'status' => 'succeeded',
        ]);
    }

    public function test_model_comparison_rejects_disabled_missing_secret_or_cross_user_profiles(): void
    {
        $healthy = $this->profile('Healthy', 'gpt-ok');
        $disabled = $this->profile('Disabled', 'gpt-disabled', status: 'disabled');
        $missingSecret = $this->profile('No Secret', 'gpt-empty', secret: null);
        $otherUser = $this->profile('Other User', 'gpt-other', user: User::factory()->create());

        foreach ([[$healthy->id, $disabled->id], [$healthy->id, $missingSecret->id], [$healthy->id, $otherUser->id]] as $ids) {
            $this->postJson('/api/talos/model-comparisons', [
                'prompt' => 'This should be rejected.',
                'model_profile_ids' => $ids,
            ])->assertUnprocessable();
        }
    }

    public function test_vote_reveals_model_identities_without_leaking_before_vote(): void
    {
        $alpha = $this->profile('OpenAI Alpha', 'gpt-alpha');
        $beta = $this->profile('Anthropic Beta', 'claude-beta');

        $created = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Choose the clearest recovery answer.',
            'model_profile_ids' => [$alpha->id, $beta->id],
        ])->assertCreated();

        $comparisonId = $created->json('data.id');
        $laneId = $created->json('data.lanes.0.id');
        $this->assertIsString($comparisonId);
        $this->assertIsString($laneId);

        $this->getJson("/api/talos/model-comparisons/{$comparisonId}")
            ->assertOk()
            ->assertJsonMissingPath('data.lanes.0.run_id')
            ->assertJsonMissingPath('data.lanes.0.model_profile_id')
            ->assertJsonMissing(['OpenAI Alpha', 'Anthropic Beta']);

        $voted = $this->postJson("/api/talos/model-comparisons/{$comparisonId}/vote", [
            'lane_id' => $laneId,
            'scorecard' => [
                'usefulness' => 5,
                'correctness' => 4,
                'evidence' => 4,
                'formatting' => 5,
                'speed' => 3,
                'cost' => 4,
            ],
            'reason' => 'Best evidence structure.',
        ]);

        $voted
            ->assertOk()
            ->assertJsonPath('data.winner_lane_id', $laneId)
            ->assertJsonPath('data.revealed', true)
            ->assertJsonStructure(['data' => ['lanes' => [['run_id', 'model_profile_id', 'model_profile']]]]);

        $this->postJson("/api/talos/model-comparisons/{$comparisonId}/vote", [
            'lane_id' => $laneId,
            'reason' => 'Second vote.',
        ])->assertStatus(409);
    }

    public function test_failed_lane_keeps_successful_lane_evidence_and_can_promote_to_benchmark(): void
    {
        $success = $this->profile('Success Model', 'gpt-success');
        $failed = $this->profile('Failed Model', 'gpt-failed', status: 'failed');

        $created = $this->postJson('/api/talos/model-comparisons', [
            'prompt' => 'Generate a source-backed answer.',
            'mode' => 'parallel',
            'task_type' => 'research',
            'blind' => false,
            'model_profile_ids' => [$success->id, $failed->id],
        ]);

        $created
            ->assertCreated()
            ->assertJsonPath('data.status', 'completed_with_errors')
            ->assertJsonPath('data.lanes.0.status', 'completed')
            ->assertJsonPath('data.lanes.1.status', 'failed')
            ->assertJsonPath('data.lanes.1.error_code', 'MODEL_PROFILE_DEGRADED');

        $comparisonId = $created->json('data.id');
        $this->assertIsString($comparisonId);

        $promoted = $this->postJson("/api/talos/model-comparisons/{$comparisonId}/benchmark");

        $promoted
            ->assertCreated()
            ->assertJsonPath('data.metadata.comparison_type', 'model_profile_blind_compare')
            ->assertJsonPath('data.results.0.mode', 'model_lane_a')
            ->assertJsonPath('data.results.1.mode', 'model_lane_b');

        $groupId = $promoted->json('data.id');
        $this->assertIsString($groupId);

        $this->assertDatabaseHas('talos_benchmark_groups', [
            'id' => $groupId,
            'source_run_id' => $created->json('data.lanes.0.run_id'),
        ]);

        $this->postJson("/api/talos/model-comparisons/{$comparisonId}/benchmark")
            ->assertCreated()
            ->assertJsonPath('data.id', $groupId);
    }

    private function profile(string $displayName, string $model, string $status = 'healthy', ?string $secret = 'secret', ?User $user = null): TalosModelProfile
    {
        $profile = TalosModelProfile::query()->create([
            'user_id' => ($user ?? $this->user)->id,
            'provider' => 'openai',
            'model' => $model,
            'display_name' => $displayName,
            'encrypted_secret' => $secret !== null ? Crypt::encryptString($secret) : null,
            'base_url' => 'https://api.openai.com/v1',
            'timeout_seconds' => 60,
            'status' => $status,
            'capabilities' => ['chat' => true],
            'probe_result' => ['status' => $status],
        ]);
        assert($profile instanceof TalosModelProfile);

        return $profile;
    }
}
