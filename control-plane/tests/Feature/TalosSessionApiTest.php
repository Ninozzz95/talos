<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosSession;
use App\Models\User;
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

    public function test_sessions_are_partitioned_by_their_product_surface(): void
    {
        $chat = $this->postJson('/api/talos/sessions', [
            'title' => 'General chat',
        ])->assertCreated()->assertJsonPath('data.surface', 'chat');
        $browse = $this->postJson('/api/talos/sessions', [
            'title' => 'Browse evidence chat',
            'surface' => 'browse',
        ])->assertCreated()->assertJsonPath('data.surface', 'browse');

        $this->getJson('/api/talos/sessions?surface=chat')
            ->assertOk()
            ->assertJsonPath('data.0.id', $chat->json('data.id'))
            ->assertJsonMissing(['id' => $browse->json('data.id')]);
        $this->getJson('/api/talos/sessions?surface=browse')
            ->assertOk()
            ->assertJsonPath('data.0.id', $browse->json('data.id'))
            ->assertJsonMissing(['id' => $chat->json('data.id')]);
        $this->getJson('/api/talos/sessions?surface=invalid')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('surface');
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

    public function test_session_update_preserves_and_sanitizes_chat_management_metadata(): void
    {
        $createResponse = $this->postJson('/api/talos/sessions', [
            'title' => 'Managed chat',
            'metadata' => ['surface' => 'chat'],
        ]);

        $sessionId = $createResponse->json('data.id');
        $promptId = $createResponse->json('data.metadata.welcome_prompt_id');

        TalosSession::query()->findOrFail($sessionId)->update([
            'metadata' => [
                'surface' => 'chat',
                'welcome_prompt_id' => $promptId,
                'api-key' => 'existing-api-key',
                'private key' => 'existing-private-key',
                'unsafe_html' => '<script>alert(1)</script>',
                'nested' => [
                    'auth token' => 'existing-auth-token',
                ],
            ],
        ]);

        $this->patchJson('/api/talos/sessions/' . $sessionId, [
            'metadata' => [
                'chat_state' => [
                    'favorite' => true,
                    'archived' => true,
                    'selected' => true,
                    'folder' => 'Ops / Incidents',
                    'copied_from_session_id' => 'source-session',
                    'unsafe_html' => '<script>alert(1)</script>',
                ],
                'api key' => 'incoming-api-key',
                'private-key' => 'incoming-private-key',
                'secret_token' => 'should-not-survive',
                'welcome_prompt_id' => 'not-allowed',
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.metadata.welcome_prompt_id', $promptId)
            ->assertJsonPath('data.metadata.chat_state.favorite', true)
            ->assertJsonPath('data.metadata.chat_state.archived', true)
            ->assertJsonPath('data.metadata.chat_state.selected', true)
            ->assertJsonPath('data.metadata.chat_state.folder', 'Ops / Incidents')
            ->assertJsonPath('data.metadata.chat_state.copied_from_session_id', 'source-session')
            ->assertJsonMissing(['should-not-survive'])
            ->assertJsonMissing(['existing-api-key'])
            ->assertJsonMissing(['existing-private-key'])
            ->assertJsonMissing(['existing-auth-token'])
            ->assertJsonMissing(['incoming-api-key'])
            ->assertJsonMissing(['incoming-private-key'])
            ->assertJsonMissing(['unsafe_html']);
    }

    public function test_sessions_are_scoped_to_the_authenticated_user(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $foreignSession = TalosSession::query()->create([
            'user_id' => $other->id,
            'title' => 'Other user session',
            'mode' => 'verified_execution',
        ]);

        $this->actingAs($owner);

        $createResponse = $this->postJson('/api/talos/sessions', [
            'user_id' => $other->id,
            'title' => 'Owned session',
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('data.user_id', $owner->id);

        $ownedSessionId = $createResponse->json('data.id');

        $this->getJson('/api/talos/sessions')
            ->assertOk()
            ->assertJsonFragment(['id' => $ownedSessionId])
            ->assertJsonMissing(['id' => $foreignSession->id]);

        $this->getJson('/api/talos/sessions/' . $foreignSession->id)
            ->assertNotFound();

        $this->patchJson('/api/talos/sessions/' . $foreignSession->id, [
            'title' => 'Hijacked session',
        ])
            ->assertNotFound();

        $this->deleteJson('/api/talos/sessions/' . $foreignSession->id)
            ->assertNotFound();

        $this->patchJson('/api/talos/sessions/' . $ownedSessionId, [
            'user_id' => $other->id,
            'title' => 'Still owned session',
        ])
            ->assertOk()
            ->assertJsonPath('data.user_id', $owner->id)
            ->assertJsonPath('data.title', 'Still owned session');

        $this->assertDatabaseHas('talos_sessions', [
            'id' => $foreignSession->id,
            'user_id' => $other->id,
            'title' => 'Other user session',
        ]);
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
