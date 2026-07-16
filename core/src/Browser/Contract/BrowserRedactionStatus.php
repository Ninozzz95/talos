<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserRedactionStatus: string
{
    case None = 'none';
    case Redacted = 'redacted';
    case Quarantined = 'quarantined';
}
