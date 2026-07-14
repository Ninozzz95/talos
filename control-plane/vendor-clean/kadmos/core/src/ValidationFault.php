<?php

declare(strict_types=1);

namespace Kadmos;

final readonly class ValidationFault
{
    public function __construct(
        public string $field,
        public string $expected,
        public string $received,
        public string $message,
    ) {}
}
