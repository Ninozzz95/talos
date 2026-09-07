<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnState;

interface StreamingProviderTurnAdapter extends ProviderTurnAdapter
{
    public function streamStart(ProviderTurnRequest $request, Closure $isCancelled): ProviderStream;

    /**
     * @param list<\Kadmos\Tool\ToolResult> $toolResults
     */
    public function streamContinue(
        ProviderTurnState $state,
        array $toolResults,
        Closure $isCancelled,
    ): ProviderStream;
}
