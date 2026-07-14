<?php

declare(strict_types=1);

namespace Kadmos\Validator;

use Kadmos\ValidationResult;

interface JmpValidatorInterface
{
    /**
     * @param list<array<string, mixed>> $mutations
     * @param array<string, string> $context
     */
    public function validate(array $mutations, array $context, ?array $allowedNodeTypes = null, ?array $allowedBrowserOperations = null, bool $browserModeEnabled = false): ValidationResult;
}
