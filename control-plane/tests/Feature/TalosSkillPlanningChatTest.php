<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Models\TalosSkill;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosSkillPlanningChatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();

        config([
            'services.avm_validator.url' => 'http://validator.test',
            'services.talos.model_provider_allowed_hosts' => [
                'api.openai.test',
            ],
        ]);
    }

    public function test_chat_selects_matching_approved_skill_and_records_redacted_skill_plan(): void
    {
        $session = TalosSession::query()->create([
            'user_id' => auth()->id(),
            'title' => 'Skill routed chat',
            'mode' => 'verified_execution',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => auth()->id(),
            'provider' => 'openai',
            'model' => 'gpt-5.1-mini',
            'display_name' => 'OpenAI Work',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('profile-secret'),
            'base_url' => 'https://api.openai.test/v1',
        ]);
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'incident_triage',
            'display_name' => 'Incident triage',
            'trigger' => 'incident',
            'content' => 'Classify incident severity and cite evidence.',
            'allowed_tools' => ['DOCUMENT_SEARCH'],
            'review_status' => 'approved',
            'eval_status' => 'passed',
        ]));
        TalosSkill::query()->create($this->skillPayload([
            'name' => 'calendar_cleanup',
            'display_name' => 'Calendar cleanup',
            'trigger' => 'calendar',
            'content' => 'Draft calendar cleanup steps.',
            'review_status' => 'approved',
            'eval_status' => 'passed',
        ]));

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Incident plan created',
            ]),
        ]);

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'message' => 'Prepare an incident response checklist.',
            'model_profile_id' => $profile->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('skill_plan.selected_skills.0.name', 'incident_triage')
            ->assertJsonPath('skill_plan.selected_skills.0.allowed_tools.0', 'DOCUMENT_SEARCH')
            ->assertJsonPath('skill_plan.selection_policy.max_selected_skills', 3)
            ->assertJsonPath('run.metadata.skill_plan.selected_skills.0.name', 'incident_triage')
            ->assertJsonMissing(['Classify incident severity and cite evidence.']);

        $runId = $response->json('run.id');
        $this->assertIsString($runId);

        $event = TalosRunEvent::query()
            ->where('run_id', $runId)
            ->where('event_type', 'chat.skill_plan')
            ->firstOrFail();

        $this->assertSame('incident_triage', $event->payload['selected_skills'][0]['name'] ?? null);
        $this->assertSame('calendar_cleanup', $event->payload['excluded_skills'][0]['name'] ?? null);
        $this->assertSame('trigger_mismatch', $event->payload['excluded_skills'][0]['reason'] ?? null);

        Http::assertSent(fn ($request): bool => $request->url() === 'http://validator.test/chat'
            && is_array($request['skill_context'] ?? null)
            && $request['skill_context']['selected_skills'][0]['name'] === 'incident_triage'
            && $request['skill_context']['selected_skills'][0]['content'] === 'Classify incident severity and cite evidence.'
            && ! str_contains((string) $request['message'], 'Classify incident severity and cite evidence.'));
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function skillPayload(array $overrides = []): array
    {
        return [
            'name' => 'incident_triage',
            'display_name' => 'Incident triage',
            'trigger' => 'incident',
            'content' => 'Use only approved TALOS procedures.',
            'allowed_tools' => [],
            'risk_level' => 'medium',
            'review_status' => 'draft',
            'eval_status' => 'not_run',
            'source_type' => 'manual',
            'is_enabled' => true,
            ...$overrides,
        ];
    }
}
