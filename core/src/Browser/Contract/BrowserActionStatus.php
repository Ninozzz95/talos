<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserActionStatus: string
{
    case Proposed = 'proposed';
    case PolicyChecked = 'policy_checked';
    case Authorized = 'authorized';
    case Dispatched = 'dispatched';
    case Observed = 'observed';
    case EvidenceCommitted = 'evidence_committed';
    case Verified = 'verified';
    case Denied = 'denied';
    case Failed = 'failed';
    case Ambiguous = 'ambiguous';
}
