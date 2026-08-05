<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

use InvalidArgumentException;
use Throwable;

final class AlignmentContractException extends InvalidArgumentException
{
    public readonly string $details;

    public function __construct(
        public readonly string $errorCode,
        public readonly AlignmentContractName $contract,
        string $details,
        ?Throwable $previous = null,
    ) {
        $this->details = strlen($details) <= 512 ? $details : substr($details, 0, 509).'...';

        parent::__construct(
            $contract->label().' ['.$errorCode.']: '.$this->details,
            previous: $previous,
        );
    }
}
