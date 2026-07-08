<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosSessionPersistenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_sessions_default_to_persistent_and_temporary_sessions_are_explicit_in_create_list_and_update_responses(): void
    {
        $persistent = $this->postJson('/api/talos/sessions', [
            'title' => 'Persistent session',
        ])
            ->assertCreated()
            ->assertJsonPath('data.persistence_mode', 'persistent')
            ->json('data.id');

        $temporary = $this->postJson('/api/talos/sessions', [
            'title' => 'Temporary session',
            'persistence_mode' => 'temporary',
        ])
            ->assertCreated()
            ->assertJsonPath('data.persistence_mode', 'temporary')
            ->json('data.id');

        $this->getJson('/api/talos/sessions')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $persistent,
                'persistence_mode' => 'persistent',
            ])
            ->assertJsonFragment([
                'id' => $temporary,
                'persistence_mode' => 'temporary',
            ]);

        $this->patchJson('/api/talos/sessions/' . $temporary, [
            'persistence_mode' => 'persistent',
        ])
            ->assertOk()
            ->assertJsonPath('data.persistence_mode', 'persistent');
    }

    public function test_session_persistence_mode_rejects_unknown_values(): void
    {
        $this->postJson('/api/talos/sessions', [
            'title' => 'Invalid session',
            'persistence_mode' => 'ephemeral',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['persistence_mode']);
    }
}
