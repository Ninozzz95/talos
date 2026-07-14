<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosBrowserStateVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_browser_session_persists_and_exposes_worker_state_version(): void
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'State version contract',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $session = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-state-version',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);

        $this->assertSame(0, $session->worker_state_version);
        $this->assertSame(0, $session->toApiArray()['state_version']);

        $session->update(['worker_state_version' => 4]);

        $this->assertSame(4, $session->fresh()->worker_state_version);
        $this->assertSame(4, $session->fresh()->toApiArray()['state_version']);
    }
}
