<?php

declare(strict_types=1);

namespace AVM;

final readonly class ValidationResult
{
    /**
     * @param ValidationFault[] $errors
     */
    public function __construct(
        public bool $valid,
        public array $errors = [],
    ) {}
}
