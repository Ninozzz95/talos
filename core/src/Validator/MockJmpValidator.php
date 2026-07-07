<?php

declare(strict_types=1);

namespace Kadmos\Validator;

use Kadmos\ValidationFault;
use Kadmos\ValidationResult;

final class MockJmpValidator implements JmpValidatorInterface
{
    public function __construct(private bool $valid = true) {}

    public function validate(array $mutations, array $context): ValidationResult
    {
        if ($this->valid) {
            return new ValidationResult(true);
        }

        return new ValidationResult(false, [
            new ValidationFault(
                field: 'mock',
                expected: 'valid mutation',
                received: 'invalid mutation',
                message: 'Mock validator forced failure',
            ),
        ]);
    }
}

