<?php

declare(strict_types=1);

namespace Kadmos\Browser\Recovery;

final class BrowserRecoveryClassifier
{
    public function classify(BrowserRecoveryObservation $observation): BrowserRecoveryDecision
    {
        if (! $observation->ownershipVerified) {
            return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_ownership_unverified', 'Re-establish the authenticated task owner before recovery.');
        }
        if (! $observation->journalIntegrityVerified) {
            return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_journal_invalid', 'Inspect the immutable task journal before any further action.');
        }
        if (! $observation->versionVerified) {
            return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_version_unverified', 'Reload the latest task projection and retry recovery.');
        }
        if (! $observation->policyVerified) {
            return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_policy_unverified', 'Re-evaluate the action against the current server policy.');
        }

        if ($observation->consequentialAction
            && in_array($observation->dispatchState, ['dispatched', 'committed', 'ambiguous'], true)) {
            if (! $observation->currentFrameVerified) {
                return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_frame_unverified', 'Capture and commit a current verified frame before requesting human recovery.');
            }

            return $this->decision(BrowserRecoveryStrategy::WaitForUser, 'browser_recovery_consequential_ambiguous', 'Ask the user to inspect current evidence and choose the next action.');
        }

        if ($observation->dispatchState === 'committed' && ! $observation->evidenceCommitted) {
            return $this->decision(BrowserRecoveryStrategy::Reconcile, 'browser_recovery_evidence_reconcile', 'Capture missing evidence without redispatching the committed effect.');
        }

        if ($observation->workerAvailable
            && $observation->dispatchState === 'committed'
            && $observation->evidenceCommitted
            && $observation->idempotencyIntentMatches) {
            return $this->decision(BrowserRecoveryStrategy::Resume, 'browser_recovery_result_replay', 'Replay the persisted tool result to the provider without redispatching the Browser action.');
        }

        if ($observation->workerAvailable
            && $observation->dispatchState === 'ambiguous'
            && ! $observation->consequentialAction) {
            return $this->decision(BrowserRecoveryStrategy::Reconcile, 'browser_recovery_action_reconcile', 'Inspect the current worker state and capture evidence without redispatching the Browser action.');
        }

        if (! $observation->workerAvailable && $observation->safeCheckpointAvailable) {
            return $this->decision(BrowserRecoveryStrategy::Fork, 'browser_recovery_safe_fork', 'Start a new task identity from the last safe checkpoint.');
        }

        if ($observation->workerAvailable
            && $observation->dispatchState === 'not_dispatched'
            && $observation->idempotencyIntentMatches) {
            return $this->decision(BrowserRecoveryStrategy::Resume, 'browser_recovery_safe_resume', 'Resume with the same persisted idempotency intent.');
        }

        return $this->decision(BrowserRecoveryStrategy::Fail, 'browser_recovery_unresolved', 'Inspect the task journal and current worker state before continuing.');
    }

    private function decision(BrowserRecoveryStrategy $strategy, string $reasonCode, string $remediation): BrowserRecoveryDecision
    {
        return new BrowserRecoveryDecision($strategy, $reasonCode, $remediation);
    }
}
