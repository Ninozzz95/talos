<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserLeaseCommand;
use App\Models\TalosBrowserSessionLease;
use App\Models\TalosBrowserTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Tool\ProceduralLoopGuard;

final readonly class TalosBrowserTakeoverService
{
    private const COMMAND_SCHEMA_VERSION = 'talos.browser.lease-command.v1';

    public function __construct(private TalosBrowserTaskRepository $tasks) {}

    public function acquire(
        int $ownerUserId,
        string $taskId,
        string $ownerId,
        int $ttlSeconds,
        string $commandId,
    ): TalosBrowserLeaseGrant {
        [$ownerId, $commandId, $ttlSeconds] = $this->validatedCommand($ownerId, $commandId, $ttlSeconds);
        $commandHash = $this->commandHash([
            'operation' => 'acquire',
            'task_id' => $taskId,
            'owner_id' => $ownerId,
            'ttl_seconds' => $ttlSeconds,
        ]);

        return DB::transaction(function () use ($ownerUserId, $taskId, $ownerId, $ttlSeconds, $commandId, $commandHash): TalosBrowserLeaseGrant {
            $replayed = $this->replayedCommand($ownerUserId, $taskId, $commandId, $commandHash);
            if ($replayed instanceof TalosBrowserLeaseCommand) {
                return $this->grant($replayed->lease, null);
            }

            $task = $this->lockedTask($ownerUserId, $taskId);
            $this->expireStaleLocked($task->id);
            if ($this->activeLeaseQuery($task->id)->exists()) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE',
                    'Another human operator currently controls this Browser task.',
                );
            }
            if (! in_array($task->status, [BrowserTaskStatus::Running->value, BrowserTaskStatus::WaitingUser->value], true)) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                    'Browser task cannot enter human takeover from its current state.',
                );
            }

            $token = bin2hex(random_bytes(32));
            $expiresAt = now()->addSeconds($ttlSeconds);
            $lease = new TalosBrowserSessionLease([
                'schema_version' => 'talos.browser.lease.v1',
                'task_id' => $task->id,
                'user_id' => $task->user_id,
                'talos_session_id' => $task->talos_session_id,
                'owner_type' => 'human',
                'owner_id' => $ownerId,
                'status' => 'active',
                'acquired_at' => now(),
                'expires_at' => $expiresAt,
            ]);
            $lease->setFencingToken($token)->save();

            if ($task->status === BrowserTaskStatus::Running->value) {
                $task = $this->tasks->transition(
                    $ownerUserId,
                    $task->id,
                    BrowserTaskStatus::WaitingUser,
                    $task->state_version,
                    $this->stateCommandId('acquire', $commandId),
                    'task.takeover_acquired',
                    'user',
                    (string) $ownerUserId,
                    eventPayload: ['lease_id' => $lease->id, 'owner_id' => $ownerId],
                );
            }

            $this->appendCommand($lease, $commandId, $commandHash, 'acquire', [
                'owner_id' => $ownerId,
                'ttl_seconds' => $ttlSeconds,
                'expires_at' => $expiresAt->toJSON(),
                'task_state_version' => $task->state_version,
            ]);

            return $this->grant($lease->refresh(), $token);
        }, 3);
    }

    public function renew(
        int $ownerUserId,
        string $taskId,
        string $ownerId,
        string $fencingToken,
        int $ttlSeconds,
        string $commandId,
    ): TalosBrowserLeaseGrant {
        [$ownerId, $commandId, $ttlSeconds] = $this->validatedCommand($ownerId, $commandId, $ttlSeconds);
        $tokenHash = $this->tokenHash($fencingToken);
        $commandHash = $this->commandHash([
            'operation' => 'renew',
            'task_id' => $taskId,
            'owner_id' => $ownerId,
            'fencing_token_sha256' => $tokenHash,
            'ttl_seconds' => $ttlSeconds,
        ]);

        return DB::transaction(function () use ($ownerUserId, $taskId, $ownerId, $fencingToken, $ttlSeconds, $commandId, $commandHash): TalosBrowserLeaseGrant {
            $replayed = $this->replayedCommand($ownerUserId, $taskId, $commandId, $commandHash);
            if ($replayed instanceof TalosBrowserLeaseCommand) {
                $expiresAt = $replayed->payload['expires_at'] ?? null;
                if (! is_string($expiresAt)) {
                    throw new TalosBrowserTaskException(
                        'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                        'Persisted Browser takeover command result is invalid.',
                    );
                }

                return $this->grant($replayed->lease, null, $expiresAt);
            }

            $task = $this->lockedTask($ownerUserId, $taskId);
            $this->expireStaleLocked($task->id);
            $lease = $this->activeLeaseQuery($task->id)->lockForUpdate()->first();
            $this->assertLeaseToken($lease, $ownerId, $fencingToken);
            $expiresAt = now()->addSeconds($ttlSeconds);
            $lease->forceFill(['expires_at' => $expiresAt])->save();
            $this->appendCommand($lease, $commandId, $commandHash, 'renew', [
                'owner_id' => $ownerId,
                'ttl_seconds' => $ttlSeconds,
                'expires_at' => $expiresAt->toJSON(),
            ]);

            return $this->grant($lease->refresh(), null);
        }, 3);
    }

    public function returnControl(
        int $ownerUserId,
        string $taskId,
        string $ownerId,
        string $fencingToken,
        string $commandId,
    ): TalosBrowserTask {
        [$ownerId, $commandId] = $this->validatedIdentity($ownerId, $commandId);
        $commandHash = $this->commandHash([
            'operation' => 'return',
            'task_id' => $taskId,
            'owner_id' => $ownerId,
            'fencing_token_sha256' => $this->tokenHash($fencingToken),
        ]);

        return DB::transaction(function () use ($ownerUserId, $taskId, $ownerId, $fencingToken, $commandId, $commandHash): TalosBrowserTask {
            $replayed = $this->replayedCommand($ownerUserId, $taskId, $commandId, $commandHash);
            if ($replayed instanceof TalosBrowserLeaseCommand) {
                return $this->tasks->owned($ownerUserId, $taskId);
            }

            $task = $this->lockedTask($ownerUserId, $taskId);
            $this->expireStaleLocked($task->id);
            $lease = $this->activeLeaseQuery($task->id)->lockForUpdate()->first();
            $this->assertLeaseToken($lease, $ownerId, $fencingToken);
            if ($task->status !== BrowserTaskStatus::WaitingUser->value) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                    'Browser task is not waiting for human control to return.',
                );
            }

            $evidence = TalosBrowserEvidenceBundle::query()
                ->ownedBy($ownerUserId)
                ->where('task_id', $task->id)
                ->where('talos_session_id', $task->talos_session_id)
                ->whereNotNull('snapshot_artifact_id')
                ->whereNotNull('committed_at')
                ->where('captured_at', '>', $lease->acquired_at)
                ->orderByDesc('captured_at')
                ->lockForUpdate()
                ->first();
            if (! $evidence instanceof TalosBrowserEvidenceBundle) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TAKEOVER_EVIDENCE_REQUIRED',
                    'Capture a fresh Browser snapshot after takeover before returning control.',
                );
            }

            $checkpointId = (string) Str::uuid();
            $resumed = $this->tasks->transition(
                $ownerUserId,
                $task->id,
                BrowserTaskStatus::Running,
                $task->state_version,
                $this->stateCommandId('return', $commandId),
                'task.takeover_returned',
                'user',
                (string) $ownerUserId,
                ['reconciled_at' => now()],
                ['lease_id' => $lease->id, 'evidence_id' => $evidence->id, 'checkpoint_id' => $checkpointId],
            );
            TalosBrowserCheckpoint::query()->create([
                'id' => $checkpointId,
                'schema_version' => 'talos.browser.checkpoint.v1',
                'task_id' => $resumed->id,
                'user_id' => $resumed->user_id,
                'talos_session_id' => $resumed->talos_session_id,
                'task_state_version' => $resumed->state_version,
                'task_status' => $resumed->status,
                'tab_inventory' => [],
                'budget' => $resumed->budget,
                'action_frontier' => $resumed->actions()
                    ->whereNotIn('status', ['committed', 'failed', 'cancelled'])
                    ->orderBy('sequence')->pluck('id')->all(),
                'evidence_frontier' => [$evidence->id],
                'runtime_reconciliation_token' => bin2hex(random_bytes(32)),
                'recorded_at' => now(),
            ]);
            $lease->forceFill(['status' => 'released', 'released_at' => now()])->save();
            $this->appendCommand($lease, $commandId, $commandHash, 'return', [
                'owner_id' => $ownerId,
                'evidence_id' => $evidence->id,
                'checkpoint_id' => $checkpointId,
                'task_state_version' => $resumed->state_version,
            ]);

            return $resumed->refresh();
        }, 3);
    }

    public function expireStale(string $taskId): int
    {
        return DB::transaction(fn (): int => $this->expireStaleLocked($taskId), 3);
    }

    public function assertModelMayDispatch(TalosBrowserTask $task): void
    {
        $this->expireStale((string) $task->id);
        if ($this->activeLeaseQuery((string) $task->id)->exists()) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE',
                'Model dispatch is paused while a human operator controls this Browser task.',
            );
        }
    }

    private function lockedTask(int $ownerUserId, string $taskId): TalosBrowserTask
    {
        $task = TalosBrowserTask::query()->ownedBy($ownerUserId)->whereKey($taskId)->lockForUpdate()->first();
        if (! $task instanceof TalosBrowserTask) {
            throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_NOT_FOUND', 'Browser task was not found.');
        }

        return $task;
    }

    private function activeLeaseQuery(string $taskId)
    {
        return TalosBrowserSessionLease::query()
            ->where('task_id', $taskId)
            ->where('status', 'active')
            ->where('expires_at', '>', now());
    }

    private function expireStaleLocked(string $taskId): int
    {
        return TalosBrowserSessionLease::query()
            ->where('task_id', $taskId)
            ->where('status', 'active')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'released_at' => now(), 'updated_at' => now()]);
    }

    private function assertLeaseToken(mixed $lease, string $ownerId, string $fencingToken): void
    {
        if (! $lease instanceof TalosBrowserSessionLease
            || $lease->owner_type !== 'human'
            || $lease->owner_id !== $ownerId
            || ! $lease->matchesFencingToken($fencingToken)) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TAKEOVER_TOKEN_INVALID',
                'Human takeover lease or fencing token is no longer valid.',
            );
        }
    }

    private function replayedCommand(
        int $ownerUserId,
        string $taskId,
        string $commandId,
        string $commandHash,
    ): ?TalosBrowserLeaseCommand {
        $command = TalosBrowserLeaseCommand::query()
            ->ownedBy($ownerUserId)
            ->where('command_id', $commandId)
            ->lockForUpdate()
            ->first();
        if (! $command instanceof TalosBrowserLeaseCommand) {
            return null;
        }
        if ($command->task_id !== $taskId || ! hash_equals($command->command_sha256, $commandHash)) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'Browser takeover command ID was already used for a different intent.',
            );
        }

        return $command;
    }

    /** @param array<string, mixed> $payload */
    private function appendCommand(
        TalosBrowserSessionLease $lease,
        string $commandId,
        string $commandHash,
        string $operation,
        array $payload,
    ): void {
        TalosBrowserLeaseCommand::query()->create([
            'schema_version' => self::COMMAND_SCHEMA_VERSION,
            'lease_id' => $lease->id,
            'task_id' => $lease->task_id,
            'user_id' => $lease->user_id,
            'talos_session_id' => $lease->talos_session_id,
            'command_id' => $commandId,
            'command_sha256' => $commandHash,
            'operation' => $operation,
            'payload' => $payload,
            'occurred_at' => now(),
        ]);
    }

    private function grant(TalosBrowserSessionLease $lease, ?string $token, ?string $expiresAt = null): TalosBrowserLeaseGrant
    {
        return new TalosBrowserLeaseGrant(
            (string) $lease->id,
            (string) $lease->owner_type,
            (string) $lease->owner_id,
            (string) $lease->status,
            $expiresAt ?? $lease->expires_at->toJSON(),
            $token,
        );
    }

    /** @return array{string, string, int} */
    private function validatedCommand(string $ownerId, string $commandId, int $ttlSeconds): array
    {
        [$ownerId, $commandId] = $this->validatedIdentity($ownerId, $commandId);
        if ($ttlSeconds < 15 || $ttlSeconds > 300) {
            throw new InvalidArgumentException('Browser takeover TTL must be between 15 and 300 seconds.');
        }

        return [$ownerId, $commandId, $ttlSeconds];
    }

    /** @return array{string, string} */
    private function validatedIdentity(string $ownerId, string $commandId): array
    {
        $ownerId = trim($ownerId);
        $commandId = trim($commandId);
        if ($ownerId === '' || mb_strlen($ownerId) > 256 || $commandId === '' || mb_strlen($commandId) > 128) {
            throw new InvalidArgumentException('Browser takeover owner or command ID is invalid.');
        }

        return [$ownerId, $commandId];
    }

    private function tokenHash(string $token): string
    {
        if ($token === '' || strlen($token) > 256) {
            throw new InvalidArgumentException('Browser takeover fencing token is invalid.');
        }

        return 'sha256:'.hash('sha256', $token);
    }

    /** @param array<string, mixed> $intent */
    private function commandHash(array $intent): string
    {
        return 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($intent));
    }

    private function stateCommandId(string $operation, string $commandId): string
    {
        return 'takeover-'.$operation.'-'.hash('sha256', $commandId);
    }
}
