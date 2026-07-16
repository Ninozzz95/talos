<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserLeaseOwnerType: string
{
    case Model = 'model';
    case Human = 'human';
    case System = 'system';
}
