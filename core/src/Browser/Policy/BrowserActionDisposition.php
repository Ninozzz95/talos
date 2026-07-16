<?php

declare(strict_types=1);

namespace Kadmos\Browser\Policy;

enum BrowserActionDisposition: string
{
    case Allow = 'allow';
    case Confirm = 'confirm';
    case HumanOnly = 'human_only';
    case Deny = 'deny';
}
