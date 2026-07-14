<?php

declare(strict_types=1);

namespace Kadmos;

final class NodeStatus
{
    public const PENDING = 'PENDING';
    public const VALIDATED = 'VALIDATED';
    public const RUNNING = 'RUNNING';
    public const SUCCESS = 'SUCCESS';
    public const FAILED = 'FAILED';
    public const BLOCKED_BY_DEPENDENCY = 'BLOCKED_BY_DEPENDENCY';
    public const AWAITING_APPROVAL = 'AWAITING_APPROVAL';
    public const RETRYING = 'RETRYING';
    public const SKIPPED = 'SKIPPED';
    public const PRUNED = 'PRUNED';

    private function __construct()
    {
    }
}
