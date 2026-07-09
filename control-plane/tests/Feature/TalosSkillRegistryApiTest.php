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

        $response = $this->getJson('/api/talos/skills/planning-context')
            ->assertOk()
            ->assertJsonCount(1, 'data.skills')
            ->assertJsonPath('data.skills.0.name', 'approved_high');

        $this->assertSame(['approved_high'], collect($response->json('data.skills'))->pluck('name')->all());
        $this->assertSame('draft_high', $response->json('data.excluded_skills.0.name'));
        $this->assertSame('review_not_approved', $response->json('data.excluded_skills.0.reason'));
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

    public function test_planning_context_returns_exclusion_reasons_for_non_eligible_skills(): void
    {
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'eligible',
            'review_status' => 'approved',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'disabled_skill',
            'is_enabled' => false,
            'review_status' => 'approved',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'rejected_skill',
            'review_status' => 'rejected',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'quarantined_skill',
            'review_status' => 'quarantined',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'imported_untrusted',
            'source_type' => 'imported',
            'review_status' => 'approved',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'internal_dev',
            'review_status' => 'approved',
            'eval_status' => 'passed',
            'metadata' => ['internal_dev' => true],
        ]));

        $response = $this->getJson('/api/talos/skills/planning-context')
            ->assertOk()
            ->assertJsonCount(1, 'data.skills')
            ->assertJsonPath('data.skills.0.name', 'eligible')
            ->assertJsonPath('data.policy.exclusion_reasons_are_reported', true);

        $excluded = collect($response->json('data.excluded_skills'));

        $this->assertSame([
            'disabled',
            'review_rejected',
            'review_quarantined',
            'untrusted_import',
            'internal_dev',
        ], $excluded->pluck('reason')->all());
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
