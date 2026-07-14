<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosBrowserSession;
use App\Models\TalosToolTurn;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ToolResult;

interface TalosToolExecutionBackend
{
    public function execute(
        ProceduralNode $node,
        TalosToolTurn $turn,
        ?TalosBrowserSession $browserSession = null,
    ): ToolResult;
}
