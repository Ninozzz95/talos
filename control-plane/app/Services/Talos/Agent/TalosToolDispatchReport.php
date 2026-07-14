<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use Kadmos\Tool\ToolResult;

final readonly class TalosToolDispatchReport
{
    /**
     * @param list<ToolResult> $results
     * @param list<string> $waitingApprovalCallIds
     * @param list<string> $blockedCallIds
     */
    public function __construct(
        public string $status,
        public array $results,
        public array $waitingApprovalCallIds,
        public array $blockedCallIds,
    ) {}
}
