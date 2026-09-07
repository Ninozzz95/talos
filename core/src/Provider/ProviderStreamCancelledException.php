<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use RuntimeException;

final class ProviderStreamCancelledException extends RuntimeException
{
    public function __construct(public readonly string $reason)
    {
        if (preg_match('/^[a-z][a-z0-9_]{0,63}$/', $reason) !== 1) {
            throw new InvalidArgumentException('Provider stream cancellation reason is invalid.');
        }

        parent::__construct('Provider stream was cancelled.');
    }
}
