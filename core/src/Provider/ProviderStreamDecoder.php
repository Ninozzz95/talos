<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Kadmos\Tool\ProviderTurnResponse;

interface ProviderStreamDecoder
{
    /** @return list<ProviderStreamEvent> */
    public function push(string $chunk): array;

    public function finish(): ProviderTurnResponse;
}
