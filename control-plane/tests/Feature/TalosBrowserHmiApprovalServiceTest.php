<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserHmiApprovalService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosBrowserHmiApprovalServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_challenge_binds_every_executable_field_and_can_be_completed_once(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);

        $approval = $service->issue($payload);

        $this->assertSame('pending', $approval->status);
        $this->assertTrue($approval->expires_at->between(now()->addSeconds(59), now()->addSeconds(61)));
        $this->assertSame('sha256:'.hash('sha256', $service->canonicalJson($payload['payload'])), $approval->payload_hash);
        $this->assertSame('sha256:'.hash('sha256', $service->canonicalJson($payload)), $approval->request_hash);

        $service->approve((string) $approval->id, (int) $user->id, $payload);
        $this->assertSame('approved', $approval->fresh()->status);
        $executionPayload = [...$payload['payload'], 'sensitive_effect_authorized' => true];
        $leaseToken = $service->claimForExecution((string) $approval->id, (int) $user->id, $payload, $executionPayload);
        $this->assertIsString($leaseToken);
        $result = ['data' => ['interaction' => ['command_id' => $payload['payload']['command_id']]]];
        $this->assertTrue($service->completeExecution((string) $approval->id, (int) $user->id, $payload, $result, $leaseToken));
        $this->assertFalse($service->completeExecution((string) $approval->id, (int) $user->id, $payload, $result, $leaseToken));
        $this->assertDatabaseHas('talos_browser_hmi_approvals', ['id' => $approval->id, 'status' => 'consumed']);
    }

    public function test_issue_is_idempotent_for_the_same_exact_command_binding(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);

        $first = $service->issue($payload);
        $second = $service->issue($payload);

        $this->assertSame($first->id, $second->id);
        $this->assertDatabaseCount('talos_browser_hmi_approvals', 1);
    }

    public function test_execution_claim_is_non_terminal_until_an_exact_result_is_recorded(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);
        $binding = ['request_hash' => (string) $approval->request_hash];

        $service->approve((string) $approval->id, (int) $user->id, $binding);
        $executionPayload = [...$payload['payload'], 'sensitive_effect_authorized' => true];
        $firstLease = $service->claimForExecution((string) $approval->id, (int) $user->id, $binding, $executionPayload);
        $this->assertIsString($firstLease);
        $this->assertSame('executing', $approval->fresh()->status);
        $this->assertNull($approval->fresh()->consumed_at);
        $this->assertSame(1, $approval->fresh()->execution_attempts);
        $this->assertSame($executionPayload, $approval->fresh()->execution_payload);
        $this->assertTrue($approval->fresh()->execution_lease_expires_at->isFuture());

        $this->assertFalse($service->reclaimForExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
        ));
        $approval->forceFill(['execution_lease_expires_at' => now()->subSecond()])->save();
        $secondLease = $service->reclaimForExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
        );
        $this->assertIsString($secondLease);
        $this->assertSame(2, $approval->fresh()->execution_attempts);

        $result = ['data' => ['interaction' => ['status' => 'executed', 'command_id' => $payload['payload']['command_id']]]];
        $this->assertTrue($service->completeExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
            $result,
            $secondLease,
        ));

        $fresh = $approval->fresh();
        $this->assertSame('consumed', $fresh->status);
        $this->assertSame($result, $fresh->result_payload);
        $this->assertNotNull($fresh->consumed_at);
    }

    public function test_execution_lease_token_fences_a_late_attempt_after_reclaim(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);
        $binding = ['request_hash' => (string) $approval->request_hash];
        $executionPayload = [...$payload['payload'], 'sensitive_effect_authorized' => true];

        $service->approve((string) $approval->id, (int) $user->id, $binding);
        $firstLease = $service->claimForExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
            $executionPayload,
        );
        $this->assertIsString($firstLease);
        $this->assertTrue(Str::isUuid($firstLease));

        $approval->forceFill(['execution_lease_expires_at' => now()->subSecond()])->save();
        $secondLease = $service->reclaimForExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
        );
        $this->assertIsString($secondLease);
        $this->assertTrue(Str::isUuid($secondLease));
        $this->assertNotSame($firstLease, $secondLease);
        $this->assertFalse($service->renewExecutionLease(
            (string) $approval->id,
            (int) $user->id,
            (string) $payload['payload']['command_id'],
            $firstLease,
        ));
        $this->assertTrue($service->renewExecutionLease(
            (string) $approval->id,
            (int) $user->id,
            (string) $payload['payload']['command_id'],
            $secondLease,
        ));

        $result = ['data' => ['interaction' => ['status' => 'executed', 'command_id' => $payload['payload']['command_id']]]];
        $this->assertFalse($service->completeExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
            $result,
            $firstLease,
        ));
        $this->assertFalse($service->abortExecution(
            (string) $approval->id,
            (int) $user->id,
            (string) $payload['payload']['command_id'],
            $firstLease,
        ));
        $this->assertFalse($service->releaseOrdinaryPreDispatchFailure(
            (string) $approval->id,
            (int) $user->id,
            (string) $payload['payload']['command_id'],
            $firstLease,
        ));
        $this->assertTrue($service->completeExecution(
            (string) $approval->id,
            (int) $user->id,
            $binding,
            $result,
            $secondLease,
        ));
        $this->assertSame('consumed', $approval->fresh()->status);
    }

    public function test_wrong_owner_cannot_approve_the_challenge(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        [$session, $artifact] = $this->browserState($owner);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);

        $this->expectException(InvalidArgumentException::class);
        $service->approve((string) $approval->id, (int) $other->id, $payload);
    }

    public function test_any_mutated_binding_cannot_approve_the_challenge(): void
    {
        $owner = User::factory()->create();
        [$session, $artifact] = $this->browserState($owner);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);

        $mutated = $payload;
        $mutated['normalized_x'] = 0.9;
        $this->expectException(InvalidArgumentException::class);
        $service->approve((string) $approval->id, (int) $owner->id, $mutated);
    }

    public function test_empty_binding_is_rejected_for_every_terminal_operation(): void
    {
        $owner = User::factory()->create();
        [$session, $artifact] = $this->browserState($owner);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);

        $this->assertInvalid(fn () => $service->approve((string) $approval->id, (int) $owner->id, []));
        $this->assertInvalid(fn () => $service->reject((string) $approval->id, (int) $owner->id, []));
        $this->assertInvalid(fn () => $service->claimForExecution((string) $approval->id, (int) $owner->id, []));
        $this->assertInvalid(fn () => $service->completeExecution(
            (string) $approval->id,
            (int) $owner->id,
            [],
            ['data' => []],
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        ));
        $this->assertSame('pending', $approval->fresh()->status);
    }

    public function test_partial_binding_is_rejected_and_request_hash_is_an_explicit_exact_contract(): void
    {
        $owner = User::factory()->create();
        [$session, $artifact] = $this->browserState($owner);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);

        $this->assertInvalid(fn () => $service->approve((string) $approval->id, (int) $owner->id, ['browser_session_id' => $session->id]));
        $service->approve((string) $approval->id, (int) $owner->id, ['request_hash' => $approval->request_hash]);
        $this->assertSame('approved', $approval->fresh()->status);
    }

    public function test_expired_and_rejected_challenges_are_terminal(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $expired = $service->issue($payload);
        $expired->forceFill(['expires_at' => now()->subSecond()])->save();

        $this->assertTrue($service->expire((string) $expired->id, (int) $user->id));
        $this->assertFalse($service->claimForExecution((string) $expired->id, (int) $user->id, $payload));
        $this->assertSame('expired', $expired->fresh()->status);

        $rejectedPayload = $payload;
        $rejectedPayload['payload']['command_id'] = 'hmi_'.str_repeat('d', 64);
        $rejected = $service->issue($rejectedPayload);
        $service->reject((string) $rejected->id, (int) $user->id, $rejectedPayload);
        $this->assertSame('rejected', $rejected->fresh()->status);
        $this->assertFalse($service->claimForExecution((string) $rejected->id, (int) $user->id, $rejectedPayload));
    }

    public function test_invalidated_challenge_is_terminal_and_cannot_be_restored_or_consumed(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $service = app(TalosBrowserHmiApprovalService::class);
        $payload = $this->payload($session, $artifact);
        $approval = $service->issue($payload);

        $this->assertTrue($service->invalidate(
            (string) $approval->id,
            (int) $user->id,
            ['request_hash' => (string) $approval->request_hash],
        ));
        $this->assertSame('invalidated', $approval->fresh()->status);
        $this->assertFalse($service->claimForExecution((string) $approval->id, (int) $user->id, $payload));
        $this->assertFalse($service->invalidate(
            (string) $approval->id,
            (int) $user->id,
            ['request_hash' => (string) $approval->request_hash],
        ));
    }

    public function test_issue_rejects_unversioned_payloads_and_non_sha256_bindings(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $payload = $this->payload($session, $artifact);
        $payload['payload']['schema_version'] = 'wrong';
        $payload['artifact_sha256'] = 'not-a-hash';

        $this->expectException(InvalidArgumentException::class);
        app(TalosBrowserHmiApprovalService::class)->issue($payload);
    }

    public function test_issue_rejects_a_worker_frame_hash_that_does_not_match_the_bound_artifact(): void
    {
        $user = User::factory()->create();
        [$session, $artifact] = $this->browserState($user);
        $payload = $this->payload($session, $artifact);
        $payload['payload']['expected_frame_sha256'] = 'sha256:'.str_repeat('c', 64);

        $this->expectException(InvalidArgumentException::class);
        app(TalosBrowserHmiApprovalService::class)->issue($payload);
    }

    /** @return array{TalosBrowserSession, TalosBrowserArtifact} */
    private function browserState(User $user): array
    {
        $session = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'worker_session_id' => 'worker-'.uniqid(),
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['actions' => false, 'hmiActions' => true],
            'policy' => [],
            'worker_state_version' => 7,
            'expires_at' => now()->addHour(),
        ]);
        $artifact = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $session->id,
            'user_id' => $user->id,
            'type' => 'screenshot',
            'mime' => 'image/png',
            'storage_disk' => 'local',
            'storage_path' => 'browser/'.$session->id.'.png',
            'sha256' => 'sha256:'.str_repeat('a', 64),
            'metadata' => ['state_version' => 7],
        ]);

        return [$session, $artifact];
    }

    /** @return array<string, mixed> */
    private function payload(TalosBrowserSession $session, TalosBrowserArtifact $artifact): array
    {
        return [
            'owner_id' => (int) $session->user_id,
            'browser_session_id' => (string) $session->id,
            'artifact_id' => (string) $artifact->id,
            'artifact_sha256' => (string) $artifact->sha256,
            'state_version' => 7,
            'normalized_x' => 0.25,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
            'target_fingerprint' => 'sha256:'.str_repeat('b', 64),
            'category' => 'external_commit',
            'payload' => [
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                'command_id' => 'hmi_'.str_repeat('c', 64),
                'state_version' => 7,
                'expected_frame_sha256' => (string) $artifact->sha256,
                'normalized_x' => 0.25,
                'normalized_y' => 0.5,
                'button' => 'left',
                'click_count' => 1,
                'expected_fingerprint' => 'sha256:'.str_repeat('b', 64),
                'effect_classification' => 'sensitive',
                'sensitive_effect_authorized' => false,
            ],
        ];
    }

    private function assertInvalid(Closure $operation): void
    {
        try {
            $operation();
            $this->fail('An incomplete HMI approval binding was accepted.');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
    }
}
