<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserTaskStatus: string
{
    case Created = 'created';
    case Planning = 'planning';
    case Ready = 'ready';
    case Running = 'running';
    case WaitingUser = 'waiting_user';
    case Recovering = 'recovering';
    case Completed = 'completed';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
}
