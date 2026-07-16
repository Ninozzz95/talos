<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserLeaseStatus: string
{
    case Active = 'active';
    case Released = 'released';
    case Expired = 'expired';
}
