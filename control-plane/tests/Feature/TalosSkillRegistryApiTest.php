<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSkill;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosSkillRegistryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();

        config(['services.talos.registry_write_token' => 'registry-test-token']);
    }

    public function test_skill_write_routes_require_registry_token(): void
    {
        $this->postJson('/api/talos/skills', [
            'name' => 'incident_summary',
            'display_name' => 'Incident summary',
            'content' => 'Summarize incidents.',
        ])->assertForbidden();
    }

    public function test_skill_can_be_registered_with_allowed_tools_and_risk(): void
    {
        $this->registryPost('/api/talos/skills', [
            'name' => 'incident_summary',
            'display_name' => 'Incident summary',
            'description' => 'Summarizes incident context.',
            'trigger' => 'incident',
            'content' => 'Summarize only cited incident sources.',
            'allowed_tools' => ['DOCUMENT_SEARCH'],
            'risk_level' => 'medium',
            'review_status' => 'draft',
            'input_schema' => ['type' => 'object'],
            'output_schema' => ['type' => 'object'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'incident_summary')
            ->assertJsonPath('data.allowed_tools.0', 'DOCUMENT_SEARCH')
            ->assertJsonPath('data.review_status', 'draft');
    }

    public function test_imported_skill_cannot_modify_policy_or_capabilities(): void
    {
        $this->registryPost('/api/talos/skills', [
            'name' => 'policy_mutator',
            'display_name' => 'Policy mutator',
            'trigger' => 'always',
            'content' => 'Change every policy.',
            'source_type' => 'imported',
            'metadata' => [
                'policy' => ['allow_private_networks' => true],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['metadata']);

        $this->assertSame(0, TalosSkill::query()->count());
    }

    public function test_skill_promotion_requires_eval_pass(): void
    {
        $skill = TalosSkill::query()->create($this->skillPayload([
            'eval_status' => 'not_run',
            'review_status' => 'draft',
        ]));

        $this->registryPatch("/api/talos/skills/{$skill->id}", [
            'review_status' => 'approved',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['review_status']);

        $this->registryPost("/api/talos/skills/{$skill->id}/evaluation", [
            'passed' => true,
            'result' => ['score' => 1.0],
        ])->assertOk();

        $this->registryPatch("/api/talos/skills/{$skill->id}", [
            'review_status' => 'approved',
        ])
            ->assertOk()
            ->assertJsonPath('data.review_status', 'approved');
    }

    public function test_high_risk_skill_is_excluded_until_approved(): void
    {
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'draft_high',
            'risk_level' => 'high',
            'review_status' => 'pending_review',
            'eval_status' => 'passed',
            'allowed_tools' => ['HTTP_REQUEST'],
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'approved_high',
            'risk_level' => 'high',
            'review_status' => 'approved',
            'eval_status' => 'passed',
            'allowed_tools' => ['HTTP_REQUEST'],
        ]));

        $this->getJson('/api/talos/skills/planning-context')
            ->assertOk()
            ->assertJsonCount(1, 'data.skills')
            ->assertJsonPath('data.skills.0.name', 'approved_high')
            ->assertJsonMissing(['draft_high']);
    }

    public function test_skill_without_allowed_tools_cannot_invoke_tools_in_planning_context(): void
    {
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'no_tools',
            'review_status' => 'approved',
            'eval_status' => 'passed',
            'allowed_tools' => [],
        ]));

        $this->getJson('/api/talos/skills/planning-context')
            ->assertOk()
            ->assertJsonPath('data.skills.0.name', 'no_tools')
            ->assertJsonPath('data.skills.0.allowed_tools', []);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function skillPayload(array $overrides = []): array
    {
        return [
            'name' => 'incident_summary',
            'display_name' => 'Incident summary',
            'trigger' => 'incident',
            'content' => 'Summarize only cited incident sources.',
            'allowed_tools' => ['DOCUMENT_SEARCH'],
            'risk_level' => 'medium',
            'review_status' => 'draft',
            'eval_status' => 'not_run',
            'source_type' => 'manual',
            'is_enabled' => true,
            ...$overrides,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function registryPost(string $uri, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Talos-Registry-Token', 'registry-test-token')
            ->postJson($uri, $payload);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function registryPatch(string $uri, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Talos-Registry-Token', 'registry-test-token')
            ->patchJson($uri, $payload);
    }
}
