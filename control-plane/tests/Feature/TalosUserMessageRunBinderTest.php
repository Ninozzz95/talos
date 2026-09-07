<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Agent\TalosUserMessageRunBinder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosUserMessageRunBinderTest extends TestCase
{
    use RefreshDatabase;

    public function test_binding_is_byte_exact_and_atomic(): void
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Exact binding',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Inspect Vehicles.',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Inspect Vehicles.'),
            'prompt' => 'Inspect Vehicles.',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $binder = $this->app->make(TalosUserMessageRunBinder::class);

        self::assertFalse($binder->matchesUnbound($session, (string) $message->id, 'inspect vehicles.'));
        self::assertFalse($binder->bind($session, $run, (string) $message->id, 'inspect vehicles.'));
        self::assertNull($message->refresh()->run_id);

        self::assertTrue($binder->matchesUnbound($session, (string) $message->id, 'Inspect Vehicles.'));
        self::assertTrue($binder->bind($session, $run, (string) $message->id, 'Inspect Vehicles.'));
        self::assertSame((string) $run->id, (string) $message->refresh()->run_id);
        self::assertFalse($binder->bind($session, $run, (string) $message->id, 'Inspect Vehicles.'));
    }

    public function test_already_bound_run_lookup_is_owner_scoped_and_byte_exact(): void
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Stream retry',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Retry exactly.'),
            'prompt' => 'Retry exactly.',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Retry exactly.',
            'run_id' => $run->id,
        ]);
        $foreignSession = TalosSession::query()->create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Foreign',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $binder = $this->app->make(TalosUserMessageRunBinder::class);

        self::assertSame(
            (string) $run->id,
            (string) $binder->alreadyBoundRun(
                $session,
                (string) $message->id,
                'Retry exactly.',
            )?->id,
        );
        self::assertNull($binder->alreadyBoundRun($session, (string) $message->id, 'retry exactly.'));
        self::assertNull($binder->alreadyBoundRun($foreignSession, (string) $message->id, 'Retry exactly.'));
    }
}
