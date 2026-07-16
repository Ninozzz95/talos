<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserSessionLease;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class TalosBrowserSchemaContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_schema_exposes_every_canonical_column_and_index(): void
    {
        $this->assertTableColumns('talos_browser_tasks', [
            'id', 'schema_version', 'user_id', 'talos_session_id', 'origin_message_id',
            'browser_session_id', 'goal', 'status', 'autonomy_profile', 'budget',
            'runtime_id', 'active_tab_id', 'state_version', 'requested_at', 'started_at',
            'completed_at', 'failed_at', 'cancelled_at', 'reconciled_at', 'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_actions', [
            'id', 'schema_version', 'task_id', 'user_id', 'talos_session_id', 'intent_id',
            'sequence', 'kind', 'arguments', 'expected_state_version', 'risk', 'idempotency_key',
            'preconditions', 'status', 'result_sha256', 'error_code', 'requested_at', 'approved_at',
            'started_at', 'committed_at', 'failed_at', 'reconciled_at', 'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_evidence_bundles', [
            'id', 'schema_version', 'task_id', 'action_id', 'user_id', 'talos_session_id',
            'worker_state_version', 'url', 'title', 'captured_at', 'frame',
            'snapshot_artifact_id', 'snapshot_mime', 'snapshot_sha256', 'snapshot_byte_size',
            'snapshot_width', 'snapshot_height', 'snapshot_redaction_status',
            'screenshot_artifact_id', 'screenshot_mime', 'screenshot_sha256', 'screenshot_byte_size',
            'screenshot_width', 'screenshot_height', 'screenshot_redaction_status',
            'before_evidence_id', 'integrity_sha256', 'claims', 'committed_at', 'reconciled_at',
            'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_checkpoints', [
            'id', 'schema_version', 'task_id', 'user_id', 'talos_session_id',
            'task_state_version', 'task_status', 'tab_inventory', 'budget', 'action_frontier',
            'evidence_frontier', 'runtime_reconciliation_token', 'recorded_at', 'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_session_leases', [
            'id', 'schema_version', 'task_id', 'user_id', 'talos_session_id', 'owner_type',
            'owner_id', 'fencing_token_hash', 'status', 'acquired_at', 'expires_at',
            'released_at', 'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_task_events', [
            'id', 'schema_version', 'task_id', 'user_id', 'talos_session_id',
            'command_id', 'command_sha256', 'event_type', 'actor_type', 'actor_id',
            'from_status', 'from_state_version', 'to_status', 'to_state_version',
            'payload', 'occurred_at', 'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_lease_commands', [
            'id', 'schema_version', 'lease_id', 'task_id', 'user_id', 'talos_session_id',
            'command_id', 'command_sha256', 'operation', 'payload', 'occurred_at',
            'created_at', 'updated_at',
        ]);
        $this->assertTableColumns('talos_browser_recovery_commands', [
            'id', 'schema_version', 'task_id', 'user_id', 'talos_session_id',
            'command_id', 'command_sha256', 'strategy', 'reason_code',
            'remediation', 'resulting_task_id', 'payload', 'occurred_at',
            'created_at', 'updated_at',
        ]);

        foreach ([
            ['talos_sessions', 'talos_sessions_id_owner_browser_v1_unique'],
            ['talos_messages', 'talos_messages_id_session_browser_v1_unique'],
            ['talos_browser_sessions', 'talos_browser_sessions_scope_v1_unique'],
            ['talos_browser_artifacts', 'talos_browser_artifacts_owner_v1_unique'],
            ['talos_browser_tasks', 'talos_browser_tasks_scope_unique'],
            ['talos_browser_tasks', 'talos_browser_tasks_session_owner_idx'],
            ['talos_browser_tasks', 'talos_browser_tasks_message_session_idx'],
            ['talos_browser_tasks', 'talos_browser_tasks_browser_scope_idx'],
            ['talos_browser_tasks', 'talos_browser_tasks_owner_status_idx'],
            ['talos_browser_tasks', 'talos_browser_tasks_session_requested_idx'],
            ['talos_browser_tasks', 'talos_browser_tasks_browser_session_idx'],
            ['talos_browser_actions', 'talos_browser_actions_scope_unique'],
            ['talos_browser_actions', 'talos_browser_actions_task_sequence_unique'],
            ['talos_browser_actions', 'talos_browser_actions_task_idempotency_unique'],
            ['talos_browser_actions', 'talos_browser_actions_task_scope_idx'],
            ['talos_browser_actions', 'talos_browser_actions_owner_status_idx'],
            ['talos_browser_actions', 'talos_browser_actions_session_requested_idx'],
            ['talos_browser_actions', 'talos_browser_actions_task_status_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_scope_unique'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_action_integrity_unique'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_task_scope_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_action_scope_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_previous_scope_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_snapshot_artifact_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_screenshot_artifact_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_owner_captured_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_session_captured_idx'],
            ['talos_browser_evidence_bundles', 'talos_browser_evidence_task_state_idx'],
            ['talos_browser_checkpoints', 'talos_browser_checkpoints_task_version_unique'],
            ['talos_browser_checkpoints', 'talos_browser_checkpoints_task_scope_idx'],
            ['talos_browser_checkpoints', 'talos_browser_checkpoints_owner_recorded_idx'],
            ['talos_browser_checkpoints', 'talos_browser_checkpoints_session_recorded_idx'],
            ['talos_browser_session_leases', 'talos_browser_leases_task_token_unique'],
            ['talos_browser_session_leases', 'talos_browser_leases_task_scope_idx'],
            ['talos_browser_session_leases', 'talos_browser_leases_task_status_expiry_idx'],
            ['talos_browser_session_leases', 'talos_browser_leases_owner_status_idx'],
            ['talos_browser_session_leases', 'talos_browser_leases_session_created_idx'],
            ['talos_browser_task_events', 'talos_browser_task_events_scope_unique'],
            ['talos_browser_task_events', 'talos_browser_task_events_version_unique'],
            ['talos_browser_task_events', 'talos_browser_task_events_command_unique'],
            ['talos_browser_task_events', 'talos_browser_task_events_task_scope_idx'],
            ['talos_browser_task_events', 'talos_browser_task_events_owner_time_idx'],
            ['talos_browser_task_events', 'talos_browser_task_events_session_time_idx'],
            ['talos_browser_session_leases', 'talos_browser_leases_scope_unique'],
            ['talos_browser_lease_commands', 'talos_browser_lease_commands_scope_unique'],
            ['talos_browser_lease_commands', 'talos_browser_lease_commands_command_unique'],
            ['talos_browser_lease_commands', 'talos_browser_lease_commands_lease_scope_idx'],
            ['talos_browser_lease_commands', 'talos_browser_lease_commands_task_time_idx'],
            ['talos_browser_lease_commands', 'talos_browser_lease_commands_owner_time_idx'],
            ['talos_browser_recovery_commands', 'talos_browser_recovery_commands_scope_unique'],
            ['talos_browser_recovery_commands', 'talos_browser_recovery_commands_command_unique'],
            ['talos_browser_recovery_commands', 'talos_browser_recovery_commands_task_time_idx'],
            ['talos_browser_recovery_commands', 'talos_browser_recovery_commands_owner_time_idx'],
        ] as [$table, $index]) {
            $this->assertTrue(Schema::hasIndex($table, $index), "Missing canonical index {$index}.");
        }
    }

    public function test_models_round_trip_projectable_contract_state(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('round-trip');
        $task = $this->task($user, $session, $message, $browser);
        $action = $this->action($task, $user, $session);
        $checkpoint = TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'task_state_version' => 0,
            'task_status' => 'created',
            'tab_inventory' => [],
            'budget' => $task->budget,
            'action_frontier' => [$action->id],
            'evidence_frontier' => [],
            'runtime_reconciliation_token' => 'opaque-reconciliation-token',
            'recorded_at' => now(),
        ]);

        $task->refresh();
        $this->assertSame('talos.browser.task.v1', $task->schema_version);
        $this->assertSame(['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4], $task->budget);
        $this->assertTrue($task->actions->contains($action));
        $this->assertTrue($task->checkpoints->contains($checkpoint));
        $this->assertSame($session->id, $task->session->id);
        $this->assertSame($message->id, $task->originMessage->id);
        $this->assertSame($browser->id, $task->browserSession->id);
        $this->assertSame([], $checkpoint->tab_inventory);
        $this->assertSame([$action->id], $checkpoint->action_frontier);
        $this->assertArrayNotHasKey('runtime_reconciliation_token', $checkpoint->toArray());
    }

    public function test_task_compare_and_swap_rejects_a_stale_state_version(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('cas');
        $task = $this->task($user, $session, $message, $browser);

        $this->assertTrue($task->compareAndSwapState(0, 'planning', ['started_at' => now()]));
        $this->assertSame(1, $task->state_version);
        $this->assertSame('planning', $task->status);
        $this->assertFalse($task->compareAndSwapState(0, 'failed', ['failed_at' => now()]));
        $this->assertSame(1, $task->refresh()->state_version);
        $this->assertSame('planning', $task->status);
        $this->assertTrue($task->compareAndSwapState(1, 'ready'));
        $this->assertSame(2, $task->state_version);
    }

    public function test_action_idempotency_is_scoped_to_its_task(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('idempotency');
        $firstTask = $this->task($user, $session, $message, $browser);
        $firstAction = $this->action($firstTask, $user, $session);

        try {
            $this->action($firstTask, $user, $session, ['id' => fake()->uuid(), 'intent_id' => fake()->uuid(), 'sequence' => 2]);
            $this->fail('Duplicate idempotency within one Browser task was accepted.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        $secondMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Second browser task.',
        ]);
        $secondTask = $this->task($user, $session, $secondMessage, $browser);
        $secondAction = $this->action($secondTask, $user, $session, ['idempotency_key' => $firstAction->idempotency_key]);

        $this->assertNotSame($firstAction->task_id, $secondAction->task_id);
        $this->assertSame($firstAction->idempotency_key, $secondAction->idempotency_key);
    }

    public function test_evidence_persists_hash_mime_dimensions_redaction_and_artifact_identity(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('evidence');
        $task = $this->task($user, $session, $message, $browser);
        $action = $this->action($task, $user, $session);
        $snapshot = $this->artifact($browser, $user, 'snapshot', 'application/json', str_repeat('a', 64));
        $screenshot = $this->artifact($browser, $user, 'screenshot', 'image/png', str_repeat('b', 64));

        $evidence = TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $action->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_state_version' => 1,
            'url' => 'https://example.test/',
            'title' => 'Example',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-1', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'snapshot_artifact_id' => $snapshot->id,
            'snapshot_mime' => 'application/json',
            'snapshot_sha256' => 'sha256:'.str_repeat('a', 64),
            'snapshot_byte_size' => 512,
            'snapshot_redaction_status' => 'none',
            'screenshot_artifact_id' => $screenshot->id,
            'screenshot_mime' => 'image/png',
            'screenshot_sha256' => 'sha256:'.str_repeat('b', 64),
            'screenshot_byte_size' => 4096,
            'screenshot_width' => 1280,
            'screenshot_height' => 800,
            'screenshot_redaction_status' => 'redacted',
            'integrity_sha256' => 'sha256:'.str_repeat('c', 64),
            'claims' => [['claim_id' => 'claim-1', 'kind' => 'title', 'value' => 'Example', 'source_artifact_id' => $snapshot->id]],
            'committed_at' => now(),
        ]);

        $evidence->refresh();
        $this->assertSame($snapshot->id, $evidence->snapshotArtifact->id);
        $this->assertSame($screenshot->id, $evidence->screenshotArtifact->id);
        $this->assertSame('sha256:'.str_repeat('c', 64), $evidence->integrity_sha256);
        $this->assertSame(1280, $evidence->screenshot_width);
        $this->assertSame('redacted', $evidence->screenshot_redaction_status);
        $this->assertSame('claim-1', $evidence->claims[0]['claim_id']);
    }

    public function test_lease_tokens_are_never_persisted_in_plaintext(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('lease');
        $task = $this->task($user, $session, $message, $browser);
        $token = 'lease-secret-that-must-not-be-stored';
        $lease = new TalosBrowserSessionLease([
            'schema_version' => 'talos.browser.lease.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'owner_type' => 'human',
            'owner_id' => (string) $user->id,
            'status' => 'active',
            'acquired_at' => now(),
            'expires_at' => now()->addMinute(),
        ]);
        $lease->setFencingToken($token);
        $lease->save();

        $stored = DB::table('talos_browser_session_leases')->where('id', $lease->id)->first();
        $this->assertNotNull($stored);
        $this->assertSame('sha256:'.hash('sha256', $token), $stored->fencing_token_hash);
        $this->assertStringNotContainsString($token, json_encode($stored, JSON_THROW_ON_ERROR));
        $this->assertTrue($lease->fresh()->matchesFencingToken($token));
        $this->assertFalse($lease->fresh()->matchesFencingToken('stale-token'));
        $this->assertArrayNotHasKey('fencing_token_hash', $lease->fresh()->toArray());
    }

    public function test_foreign_keys_reject_missing_owners_and_roots(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('foreign-keys');

        try {
            TalosBrowserTask::query()->create([
                ...$this->taskAttributes($user, $session, $message, $browser),
                'user_id' => PHP_INT_MAX,
            ]);
            $this->fail('A Browser task with a missing owner was accepted.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        try {
            TalosBrowserAction::query()->create([
                ...$this->actionAttributes(fake()->uuid(), $user, $session),
                'task_id' => fake()->uuid(),
            ]);
            $this->fail('A Browser action with a missing task root was accepted.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_composite_foreign_keys_reject_cross_owner_session_task_and_action_scope(): void
    {
        [$owner, $session, $message, $browser] = $this->browserContext('scope-owner');
        [$otherOwner, $otherSession, $otherMessage, $otherBrowser] = $this->browserContext('scope-other');

        $this->assertQueryFails(function () use ($otherOwner, $session, $message, $browser): void {
            TalosBrowserTask::query()->create($this->taskAttributes($otherOwner, $session, $message, $browser));
        }, 'A Browser task crossed its chat owner boundary.');

        $task = $this->task($owner, $session, $message, $browser);
        $this->assertQueryFails(function () use ($task, $otherOwner, $session): void {
            TalosBrowserAction::query()->create($this->actionAttributes($task->id, $otherOwner, $session));
        }, 'A Browser action crossed its task owner boundary.');
        $this->assertQueryFails(function () use ($task, $owner, $otherSession): void {
            TalosBrowserAction::query()->create($this->actionAttributes($task->id, $owner, $otherSession));
        }, 'A Browser action crossed its task session boundary.');

        $action = $this->action($task, $owner, $session);
        $otherTask = $this->task($otherOwner, $otherSession, $otherMessage, $otherBrowser);
        $this->assertQueryFails(function () use ($otherTask, $action, $otherOwner, $otherSession): void {
            TalosBrowserEvidenceBundle::query()->create([
                'schema_version' => 'talos.browser.evidence.v1',
                'task_id' => $otherTask->id,
                'action_id' => $action->id,
                'user_id' => $otherOwner->id,
                'talos_session_id' => $otherSession->id,
                'worker_state_version' => 1,
                'url' => 'https://example.test/',
                'title' => 'Cross-scoped evidence',
                'captured_at' => now(),
                'frame' => ['frame_id' => 'frame-cross', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
                'integrity_sha256' => 'sha256:'.str_repeat('e', 64),
                'claims' => [['claim_id' => 'claim-cross', 'kind' => 'title', 'value' => 'Invalid', 'source_artifact_id' => fake()->uuid()]],
                'committed_at' => now(),
            ]);
        }, 'Browser evidence crossed its action/task boundary.');

        $otherAction = $this->action($otherTask, $otherOwner, $otherSession);
        $otherEvidence = TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $otherTask->id,
            'action_id' => $otherAction->id,
            'user_id' => $otherOwner->id,
            'talos_session_id' => $otherSession->id,
            'worker_state_version' => 1,
            'url' => 'https://other.example.test/',
            'title' => 'Other task evidence',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-other', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'integrity_sha256' => 'sha256:'.str_repeat('4', 64),
            'claims' => [],
            'committed_at' => now(),
        ]);
        $this->assertQueryFails(function () use ($task, $action, $owner, $session, $otherEvidence): void {
            TalosBrowserEvidenceBundle::query()->create([
                'schema_version' => 'talos.browser.evidence.v1',
                'task_id' => $task->id,
                'action_id' => $action->id,
                'user_id' => $owner->id,
                'talos_session_id' => $session->id,
                'worker_state_version' => 2,
                'url' => 'https://example.test/',
                'title' => 'Cross-task evidence chain',
                'captured_at' => now(),
                'frame' => ['frame_id' => 'frame-chain-cross', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
                'before_evidence_id' => $otherEvidence->id,
                'integrity_sha256' => 'sha256:'.str_repeat('5', 64),
                'claims' => [],
                'committed_at' => now(),
            ]);
        }, 'A Browser evidence chain crossed its task scope.');

        $sameOwnerOtherSession = TalosSession::query()->create([
            'user_id' => $owner->id,
            'title' => 'Other same-owner session',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $sameOwnerOtherMessage = TalosMessage::query()->create([
            'session_id' => $sameOwnerOtherSession->id,
            'role' => 'user',
            'content' => 'Message from another session.',
        ]);
        $this->assertQueryFails(function () use ($owner, $session, $sameOwnerOtherMessage, $browser): void {
            TalosBrowserTask::query()->create($this->taskAttributes($owner, $session, $sameOwnerOtherMessage, $browser));
        }, 'A Browser task crossed its origin message session boundary.');

        $this->assertQueryFails(function () use ($task, $otherOwner, $session): void {
            TalosBrowserCheckpoint::query()->create([
                'schema_version' => 'talos.browser.checkpoint.v1',
                'task_id' => $task->id,
                'user_id' => $otherOwner->id,
                'talos_session_id' => $session->id,
                'task_state_version' => 0,
                'task_status' => 'created',
                'tab_inventory' => [],
                'budget' => $task->budget,
                'action_frontier' => [],
                'evidence_frontier' => [],
                'recorded_at' => now(),
            ]);
        }, 'A Browser checkpoint crossed its task owner boundary.');

        $this->assertQueryFails(function () use ($task, $owner, $otherSession): void {
            $lease = new TalosBrowserSessionLease([
                'schema_version' => 'talos.browser.lease.v1',
                'task_id' => $task->id,
                'user_id' => $owner->id,
                'talos_session_id' => $otherSession->id,
                'owner_type' => 'human',
                'owner_id' => (string) $owner->id,
                'status' => 'active',
                'acquired_at' => now(),
                'expires_at' => now()->addMinute(),
            ]);
            $lease->setFencingToken('cross-session-token');
            $lease->save();
        }, 'A Browser lease crossed its task session boundary.');
    }

    public function test_optional_browser_and_artifact_links_reject_cross_owner_scope_and_null_on_parent_delete(): void
    {
        [$owner, $session, $message, $browser] = $this->browserContext('optional-owner');
        [$otherOwner, $otherSession, $otherMessage, $otherBrowser] = $this->browserContext('optional-other');

        $this->assertQueryFails(function () use ($owner, $session, $message, $otherBrowser): void {
            TalosBrowserTask::query()->create($this->taskAttributes($owner, $session, $message, $otherBrowser));
        }, 'A Browser task accepted a browser session from another owner and conversation.');

        $task = $this->task($owner, $session, $message, $browser);
        $action = $this->action($task, $owner, $session);
        $foreignArtifact = $this->artifact($otherBrowser, $otherOwner, 'snapshot', 'application/json', str_repeat('9', 64));
        $this->assertQueryFails(function () use ($task, $action, $owner, $session, $foreignArtifact): void {
            TalosBrowserEvidenceBundle::query()->create([
                'schema_version' => 'talos.browser.evidence.v1',
                'task_id' => $task->id,
                'action_id' => $action->id,
                'user_id' => $owner->id,
                'talos_session_id' => $session->id,
                'worker_state_version' => 1,
                'url' => 'https://example.test/',
                'title' => 'Cross-owner artifact',
                'captured_at' => now(),
                'frame' => ['frame_id' => 'frame-artifact-cross', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
                'snapshot_artifact_id' => $foreignArtifact->id,
                'snapshot_mime' => 'application/json',
                'snapshot_sha256' => 'sha256:'.str_repeat('9', 64),
                'snapshot_byte_size' => 128,
                'snapshot_redaction_status' => 'none',
                'integrity_sha256' => 'sha256:'.str_repeat('8', 64),
                'claims' => [],
                'committed_at' => now(),
            ]);
        }, 'Browser evidence accepted an artifact owned by another user.');

        $artifact = $this->artifact($browser, $owner, 'snapshot', 'application/json', str_repeat('7', 64));
        $evidence = TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $action->id,
            'user_id' => $owner->id,
            'talos_session_id' => $session->id,
            'worker_state_version' => 1,
            'url' => 'https://example.test/',
            'title' => 'Nullable artifact link',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-artifact-delete', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'snapshot_artifact_id' => $artifact->id,
            'snapshot_mime' => 'application/json',
            'snapshot_sha256' => 'sha256:'.str_repeat('7', 64),
            'snapshot_byte_size' => 128,
            'snapshot_redaction_status' => 'none',
            'integrity_sha256' => 'sha256:'.str_repeat('6', 64),
            'claims' => [],
            'committed_at' => now(),
        ]);

        $artifact->delete();
        $this->assertNull($evidence->refresh()->snapshot_artifact_id);
        $browser->delete();
        $this->assertNull($task->refresh()->browser_session_id);
    }

    public function test_owner_deletion_cascades_the_complete_canonical_aggregate(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('cascade');
        $task = $this->task($user, $session, $message, $browser);
        $action = $this->action($task, $user, $session);
        $evidence = TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $action->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_state_version' => 1,
            'url' => 'https://example.test/',
            'title' => 'Cascade evidence',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-cascade', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'integrity_sha256' => 'sha256:'.str_repeat('f', 64),
            'claims' => [],
            'committed_at' => now(),
        ]);
        $checkpoint = TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'task_state_version' => 0,
            'task_status' => 'created',
            'tab_inventory' => [],
            'budget' => $task->budget,
            'action_frontier' => [$action->id],
            'evidence_frontier' => [$evidence->id],
            'recorded_at' => now(),
        ]);
        $lease = new TalosBrowserSessionLease([
            'schema_version' => 'talos.browser.lease.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'owner_type' => 'human',
            'owner_id' => (string) $user->id,
            'status' => 'active',
            'acquired_at' => now(),
            'expires_at' => now()->addMinute(),
        ]);
        $lease->setFencingToken('cascade-fencing-token');
        $lease->save();

        $ids = [$task->id, $action->id, $evidence->id, $checkpoint->id, $lease->id];
        $user->delete();

        foreach (array_combine([
            'talos_browser_tasks',
            'talos_browser_actions',
            'talos_browser_evidence_bundles',
            'talos_browser_checkpoints',
            'talos_browser_session_leases',
        ], $ids) as $table => $id) {
            $this->assertDatabaseMissing($table, ['id' => $id]);
        }
        $this->assertSame([], DB::select('PRAGMA foreign_key_check'));
    }

    /** @param list<string> $columns */
    private function assertTableColumns(string $table, array $columns): void
    {
        $this->assertTrue(Schema::hasTable($table), "Missing canonical table {$table}.");
        $this->assertTrue(Schema::hasColumns($table, $columns), "{$table} is missing one or more canonical columns.");
    }

    private function assertQueryFails(callable $operation, string $message): void
    {
        try {
            $operation();
            $this->fail($message);
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    /** @return array{User, TalosSession, TalosMessage, TalosBrowserSession} */
    private function browserContext(string $suffix): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Browser schema '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Inspect example.test.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);

        return [$user, $session, $message, $browser];
    }

    private function task(User $user, TalosSession $session, TalosMessage $message, TalosBrowserSession $browser): TalosBrowserTask
    {
        return TalosBrowserTask::query()->create($this->taskAttributes($user, $session, $message, $browser));
    }

    /** @return array<string, mixed> */
    private function taskAttributes(User $user, TalosSession $session, TalosMessage $message, TalosBrowserSession $browser): array
    {
        return [
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $message->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Inspect example.test.',
            'status' => 'created',
            'autonomy_profile' => 'assist',
            'budget' => ['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4],
            'state_version' => 0,
            'requested_at' => now(),
        ];
    }

    /** @param array<string, mixed> $overrides */
    private function action(TalosBrowserTask $task, User $user, TalosSession $session, array $overrides = []): TalosBrowserAction
    {
        return TalosBrowserAction::query()->create([
            ...$this->actionAttributes($task->id, $user, $session),
            ...$overrides,
        ]);
    }

    /** @return array<string, mixed> */
    private function actionAttributes(string $taskId, User $user, TalosSession $session): array
    {
        return [
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $taskId,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'intent_id' => fake()->uuid(),
            'sequence' => 1,
            'kind' => 'navigate',
            'arguments' => ['url' => 'https://example.test/'],
            'expected_state_version' => 0,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.str_repeat('d', 64),
            'preconditions' => [],
            'status' => 'proposed',
            'requested_at' => now(),
        ];
    }

    private function artifact(TalosBrowserSession $browser, User $user, string $type, string $mime, string $sha256): TalosBrowserArtifact
    {
        return TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $user->id,
            'type' => $type,
            'mime' => $mime,
            'storage_disk' => 'local',
            'storage_path' => 'browser/schema/'.$type,
            'sha256' => $sha256,
            'metadata' => [],
        ]);
    }
}
