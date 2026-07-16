<?php

declare(strict_types=1);

namespace Kadmos\Browser\Recovery;

use InvalidArgumentException;

final readonly class BrowserRecoveryObservation
{
    public const DISPATCH_STATES = ['not_dispatched', 'dispatched', 'committed', 'ambiguous'];

    public function __construct(
        public bool $ownershipVerified,
        public bool $journalIntegrityVerified,
        public bool $versionVerified,
        public bool $policyVerified,
        public bool $workerAvailable,
        public string $dispatchState,
        public bool $evidenceCommitted,
        public bool $consequentialAction,
        public bool $safeCheckpointAvailable,
        public bool $idempotencyIntentMatches,
        public bool $currentFrameVerified,
    ) {
        if (! in_array($dispatchState, self::DISPATCH_STATES, true)) {
            throw new InvalidArgumentException('Browser recovery dispatch state is unsupported.');
        }
        if ($evidenceCommitted && ! in_array($dispatchState, ['committed', 'dispatched'], true)) {
            throw new InvalidArgumentException('Committed browser evidence requires a dispatched action.');
        }
    }
}
