<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use Illuminate\Support\Facades\DB;

final readonly class TalosBrowserEvidenceOutbox
{
    public function __construct(private TalosBrowserEvidenceVerifier $verifier) {}

    public function resume(string $bundleId): TalosBrowserEvidenceCommitOutcome
    {
        try {
            return DB::transaction(function () use ($bundleId): TalosBrowserEvidenceCommitOutcome {
                $bundle = TalosBrowserEvidenceBundle::query()->whereKey($bundleId)->lockForUpdate()->first();
                if (! $bundle instanceof TalosBrowserEvidenceBundle) {
                    throw new TalosBrowserEvidenceException('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Browser evidence outbox entry does not exist.');
                }

                $this->verifier->verifyCurrent($bundle);
                if ($bundle->reconciled_at !== null) {
                    return new TalosBrowserEvidenceCommitOutcome($bundle->refresh(), 'reconciled', true);
                }

                $action = TalosBrowserAction::query()
                    ->whereKey($bundle->action_id)
                    ->where('task_id', $bundle->task_id)
                    ->where('user_id', $bundle->user_id)
                    ->where('talos_session_id', $bundle->talos_session_id)
                    ->lockForUpdate()
                    ->first();
                if (! $action instanceof TalosBrowserAction || $action->status !== 'committed') {
                    throw new TalosBrowserEvidenceException('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence cannot reconcile from the current action state.');
                }

                $now = now();
                $bundle->forceFill(['reconciled_at' => $now])->save();
                $action->forceFill(['status' => 'evidence_committed', 'reconciled_at' => $now])->save();

                return new TalosBrowserEvidenceCommitOutcome($bundle->refresh(), 'reconciled', false);
            }, 3);
        } catch (TalosBrowserEvidenceException $exception) {
            $this->recordRecoveryRequired($bundleId, $exception);

            throw $exception;
        }
    }

    public function resumeForAction(int $ownerUserId, string $actionId): TalosBrowserEvidenceCommitOutcome
    {
        $bundle = TalosBrowserEvidenceBundle::query()
            ->where('action_id', $actionId)
            ->where('user_id', $ownerUserId)
            ->first();
        if (! $bundle instanceof TalosBrowserEvidenceBundle) {
            throw new TalosBrowserEvidenceException('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Browser action has no staged evidence bundle.');
        }

        return $this->resume((string) $bundle->id);
    }

    private function recordRecoveryRequired(string $bundleId, TalosBrowserEvidenceException $exception): void
    {
        DB::transaction(function () use ($bundleId, $exception): void {
            $bundle = TalosBrowserEvidenceBundle::query()->whereKey($bundleId)->first();
            $task = $bundle?->task()->first();
            if (! $bundle instanceof TalosBrowserEvidenceBundle || $task === null) {
                return;
            }
            $session = TalosBrowserSession::query()
                ->whereKey($task->browser_session_id)
                ->where('user_id', $bundle->user_id)
                ->where('talos_session_id', $bundle->talos_session_id)
                ->lockForUpdate()
                ->first();
            if (! $session instanceof TalosBrowserSession) {
                return;
            }
            if (! in_array($session->status, ['closing', 'closed'], true)) {
                $session->forceFill(['status' => 'recovery_required', 'last_seen_at' => now()])->save();
            }
            TalosBrowserEvent::query()->firstOrCreate(
                [
                    'browser_session_id' => $session->id,
                    'type' => 'evidence.reconciliation_failed',
                    'command_id' => 'evidence_'.substr(hash('sha256', $bundleId."\0".$exception->faultCode), 0, 64),
                ],
                [
                    'user_id' => $session->user_id,
                    'actor' => 'system',
                    'payload' => [
                        'bundle_id' => $bundleId,
                        'fault_code' => $exception->faultCode,
                    ],
                    'policy_decision' => null,
                ],
            );
        }, 3);
    }
}
