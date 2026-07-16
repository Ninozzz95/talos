<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserActionRisk: string
{
    case Read = 'read';
    case Reversible = 'reversible';
    case Sensitive = 'sensitive';
    case Irreversible = 'irreversible';
}
