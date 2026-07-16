<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosToolCall;
use Kadmos\Tool\ToolResult;

final readonly class TalosBrowserEvidenceCommitRequest
{
    public function __construct(
        public TalosBrowserTask $task,
        public TalosBrowserAction $action,
        public TalosToolCall $call,
        public ToolResult $result,
        public TalosBrowserSession $browserSession,
        public string $resultSha256,
    ) {}
}
