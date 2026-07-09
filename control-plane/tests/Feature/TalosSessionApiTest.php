<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosSessionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_session_can_be_created_listed_shown_updated_and_deleted(): void
    {
        $createResponse = $this->postJson('/api/talos/sessions', [
            'title' => 'Incident review',
            'mode' => 'verified_execution',
            'metadata' => ['source' => 'test'],
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('data.title', 'Incident review')
            ->assertJsonPath('data.mode', 'verified_execution')
            ->assertJsonPath('data.metadata.source', 'test');

        $sessionId = $createResponse->json('data.id');

        $this->getJson('/api/talos/sessions')
            ->assertOk()
            ->assertJsonPath('data.0.id', $sessionId)
            ->assertJsonPath('data.0.title', 'Incident review');

        $this->getJson('/api/talos/sessions/' . $sessionId)
            ->assertOk()
            ->assertJsonPath('data.id', $sessionId)
            ->assertJsonPath('data.title', 'Incident review');

        $this->patchJson('/api/talos/sessions/' . $sessionId, [
            'title' => 'Updated incident review',
            'mode' => 'answer_only',
            'metadata' => ['source' => 'updated'],
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Updated incident review')
            ->assertJsonPath('data.mode', 'answer_only')
            ->assertJsonPath('data.metadata.source', 'updated');

        $this->deleteJson('/api/talos/sessions/' . $sessionId)
            ->assertNoContent();

        $this->getJson('/api/talos/sessions/' . $sessionId)
            ->assertNotFound();
    }

    public function test_session_creation_defaults_to_verified_execution_mode(): void
    {
        $this->postJson('/api/talos/sessions', [
            'title' => 'Default mode session',
        ])
            ->assertCreated()
            ->assertJsonPath('data.mode', 'verified_execution');
    }

    public function test_session_creation_assigns_stable_welcome_prompt_metadata(): void
    {
        $createResponse = $this->postJson('/api/talos/sessions', [
            'title' => 'Prompted session',
            'metadata' => ['surface' => 'chat'],
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('data.metadata.surface', 'chat');

        $sessionId = $createResponse->json('data.id');
        $promptId = $createResponse->json('data.metadata.welcome_prompt_id');

        $this->assertIsString($promptId);
        $this->assertContains($promptId, [
            'workflow-handle',
            'evidence-not-vibes',
            'avm-start',
            'replayable-run',
            'system-building',
            'incident-triage',
            'context-ingestion',
            'benchmark-proof',
            'research-brief',
            'operator-handoff',
            'policy-safe',
            'artifact-output',
        ]);

        $this->getJson('/api/talos/sessions/' . $sessionId)
            ->assertOk()
            ->assertJsonPath('data.metadata.surface', 'chat')
            ->assertJsonPath('data.metadata.welcome_prompt_id', $promptId);

        $this->patchJson('/api/talos/sessions/' . $sessionId, [
            'title' => 'Renamed prompted session',
        ])
            ->assertOk()
            ->assertJsonPath('data.metadata.welcome_prompt_id', $promptId);
    }

    public function test_session_validation_rejects_invalid_payloads(): void
    {
        $this->postJson('/api/talos/sessions', [
            'title' => '',
            'mode' => 'invalid',
            'metadata' => 'not-json-object',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'mode', 'metadata']);
    }
}
