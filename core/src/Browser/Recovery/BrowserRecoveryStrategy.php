<?php

declare(strict_types=1);

namespace Kadmos\Browser\Recovery;

enum BrowserRecoveryStrategy: string
{
    case Resume = 'resume';
    case Reconcile = 'reconcile';
    case Fork = 'fork';
    case WaitForUser = 'wait_for_user';
    case Fail = 'fail';
}
