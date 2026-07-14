<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\ToolResult;

interface ProviderTurnAdapter
{
    public function capabilities(): ProviderCapabilities;

    public function start(ProviderTurnRequest $request): ProviderTurnResponse;

    /** @param list<ToolResult> $toolResults */
    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse;
}
