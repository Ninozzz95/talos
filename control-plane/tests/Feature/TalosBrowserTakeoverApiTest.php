<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserTakeoverService;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Tests\TestCase;

final class TalosBrowserTakeoverApiTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_only_one_human_can_acquire_and_same_command_replays_without_reissuing_token(): void
    {
        Carbon::setTestNow('2026-07-15T15:00:00Z');
        [$user, , , , $task] = $this->context('exclusive');
        $service = $this->app->make(TalosBrowserTakeoverService::class);

        $grant = $service->acquire($user->id, $task->id, 'client-a', 60, 'acquire-exclusive');
        $replay = $service->acquire($user->id, $task->id, 'client-a', 60, 'acquire-exclusive');

        $this->assertNotNull($grant->fencingToken);
        $this->assertNull($replay->fencingToken);
        $this->assertSame($grant->leaseId, $replay->leaseId);
        $this->assertSame('waiting_user', $task->refresh()->status);
        $this->assertSame(1, $task->leases()->where('status', 'active')->count());
        $storedLease = (array) DB::table('talos_browser_session_leases')->where('id', $grant->leaseId)->first();
        $this->assertFalse(in_array($grant->fencingToken, $storedLease, true));

        try {
            $service->acquire($user->id, $task->id, 'client-b', 60, 'acquire-exclusive');
            $this->fail('A command ID was reused with changed takeover intent.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_COMMAND_CONFLICT', $exception->errorCode);
        }

        try {
            $service->acquire($user->id, $task->id, 'client-b', 60, 'acquire-conflict');
            $this->fail('A second human takeover lease was acquired concurrently.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE', $exception->errorCode);
        }
        try {
            $service->assertModelMayDispatch($task->refresh());
            $this->fail('Model dispatch remained enabled during human takeover.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE', $exception->errorCode);
        }
    }

    public function test_renewal_is_idempotent_and_old_token_is_fenced_after_expiry_and_reacquisition(): void
    {
        Carbon::setTestNow('2026-07-15T15:10:00Z');
        [$user, , , , $task] = $this->context('renew');
        $service = $this->app->make(TalosBrowserTakeoverService::class);
        $first = $service->acquire($user->id, $task->id, 'client-a', 30, 'acquire-renew');
        $this->assertIsString($first->fencingToken);

        Carbon::setTestNow(now()->addSeconds(10));
        $renewed = $service->renew($user->id, $task->id, 'client-a', $first->fencingToken, 90, 'renew-once');
        Carbon::setTestNow(now()->addSeconds(5));
        $replayed = $service->renew($user->id, $task->id, 'client-a', $first->fencingToken, 90, 'renew-once');
        $this->assertSame($renewed->expiresAt, $replayed->expiresAt);

        try {
            $service->renew($user->id, $task->id, 'client-a', 'wrong-token', 90, 'renew-wrong');
            $this->fail('A wrong fencing token renewed a lease.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TAKEOVER_TOKEN_INVALID', $exception->errorCode);
        }

        Carbon::setTestNow(Carbon::parse($renewed->expiresAt)->addSecond());
        $second = $service->acquire($user->id, $task->id, 'client-b', 60, 'acquire-successor');
        $this->assertNotSame($first->leaseId, $second->leaseId);
        $this->assertNotSame($first->fencingToken, $second->fencingToken);
        try {
            $service->renew($user->id, $task->id, 'client-a', $first->fencingToken, 60, 'renew-fenced');
            $this->fail('An expired predecessor token renewed after reacquisition.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TAKEOVER_TOKEN_INVALID', $exception->errorCode);
        }
    }

    public function test_return_requires_fresh_same_task_evidence_then_checkpoints_and_resumes(): void
    {
        Carbon::setTestNow('2026-07-15T15:20:00Z');
        [$user, $session, , $browser, $task] = $this->context('return');
        $service = $this->app->make(TalosBrowserTakeoverService::class);
        $grant = $service->acquire($user->id, $task->id, 'client-a', 120, 'acquire-return');
        $this->assertIsString($grant->fencingToken);

        try {
            $service->returnControl($user->id, $task->id, 'client-a', $grant->fencingToken, 'return-without-evidence');
            $this->fail('Control returned without post-takeover evidence.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TAKEOVER_EVIDENCE_REQUIRED', $exception->errorCode);
        }

        Carbon::setTestNow(now()->addSecond());
        $evidence = $this->freshEvidence($task->refresh(), $user, $session, $browser);
        $resumed = $service->returnControl(
            $user->id,
            $task->id,
            'client-a',
            $grant->fencingToken,
            'return-with-evidence',
        );

        $this->assertSame('running', $resumed->status);
        $this->assertSame(1, $resumed->checkpoints()->count());
        $checkpoint = $resumed->checkpoints()->firstOrFail();
        $this->assertSame($resumed->state_version, $checkpoint->task_state_version);
        $this->assertSame([$evidence->id], $checkpoint->evidence_frontier);
        $this->assertSame('released', $resumed->leases()->firstOrFail()->status);
    }

    public function test_authenticated_task_routes_are_owner_and_chat_scoped(): void
    {
        [$user, $session, , , $task] = $this->context('api');
        $foreign = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->getJson('/api/talos/browser/tasks?talos_session_id='.$session->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $task->id);
        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->getJson('/api/talos/browser/tasks/'.$task->id.'/events')
            ->assertOk()
            ->assertJsonCount(4, 'data');
        $this->actingAs($foreign)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->getJson('/api/talos/browser/tasks/'.$task->id)
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_TASK_NOT_FOUND');

        $response = $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson('/api/talos/browser/tasks/'.$task->id.'/takeover', [
                'owner_id' => 'api-client',
                'ttl_seconds' => 60,
                'command_id' => 'api-acquire',
            ])
            ->assertCreated()
            ->assertJsonPath('data.task.status', 'waiting_user')
            ->assertJsonPath('data.lease.token_issued', true);
        $this->assertIsString($response->json('data.lease.fencing_token'));
    }

    /** @return array{User, TalosSession, TalosMessage, TalosBrowserSession, TalosBrowserTask} */
    private function context(string $suffix): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Takeover '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Take over the Browser task.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-takeover-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'hmiActions' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
        ]);
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create([
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $message->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Complete a takeover-safe Browser task.',
            'status' => 'created',
            'autonomy_profile' => 'assist',
            'budget' => ['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4],
            'state_version' => 0,
            'requested_at' => now(),
        ], 'create-'.$suffix, 'user', (string) $user->id);
        foreach ([
            [BrowserTaskStatus::Planning, 'task.planning'],
            [BrowserTaskStatus::Ready, 'task.ready'],
            [BrowserTaskStatus::Running, 'task.running'],
        ] as $index => [$status, $event]) {
            $task = $repository->transition(
                $user->id,
                $task->id,
                $status,
                $task->state_version,
                'advance-'.$suffix.'-'.$index,
                $event,
                'system',
                statePatch: $status === BrowserTaskStatus::Running ? ['started_at' => now()] : [],
            );
        }

        return [$user, $session, $message, $browser, $task];
    }

    private function freshEvidence(
        TalosBrowserTask $task,
        User $user,
        TalosSession $session,
        TalosBrowserSession $browser,
    ): TalosBrowserEvidenceBundle {
        $action = TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'intent_id' => (string) str()->uuid(),
            'sequence' => 1,
            'kind' => 'snapshot',
            'arguments' => [],
            'expected_state_version' => $task->state_version,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.hash('sha256', 'takeover-evidence-'.$task->id),
            'preconditions' => [],
            'status' => 'committed',
            'requested_at' => now(),
            'committed_at' => now(),
        ]);
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $user->id,
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'browser/test/takeover-snapshot.json',
            'sha256' => str_repeat('a', 64),
            'metadata' => ['state_version' => $browser->worker_state_version],
        ]);

        return TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $action->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_state_version' => $browser->worker_state_version,
            'url' => $browser->current_url,
            'title' => 'Fresh takeover frame',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'takeover-frame', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'snapshot_artifact_id' => $artifact->id,
            'snapshot_mime' => 'application/json',
            'snapshot_sha256' => 'sha256:'.str_repeat('a', 64),
            'snapshot_byte_size' => 128,
            'snapshot_redaction_status' => 'none',
            'integrity_sha256' => 'sha256:'.hash('sha256', 'takeover-frame-'.$task->id),
            'claims' => [],
            'committed_at' => now(),
        ]);
    }
}
