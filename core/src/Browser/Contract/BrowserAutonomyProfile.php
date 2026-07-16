<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserAutonomyProfile: string
{
    case Observe = 'observe';
    case Assist = 'assist';
    case Act = 'act';
    case Custom = 'custom';
}
