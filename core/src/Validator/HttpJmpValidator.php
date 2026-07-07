<?php

declare(strict_types=1);

namespace Kadmos\Validator;

use Kadmos\HttpClientInterface;
use Kadmos\ValidationFault;
use Kadmos\ValidationResult;

class HttpJmpValidator implements JmpValidatorInterface
{
    public function __construct(
        private HttpClientInterface $http,
        private string $validatorUrl = 'http://127.0.0.1:3000/validate',
    ) {}

    public function validate(array $mutations, array $context): ValidationResult
    {
        $response = $this->http->postJson($this->validatorUrl, [
            'mutations' => $mutations,
            'context' => $context,
        ]);

        if (!isset($response['valid']) || !\is_bool($response['valid'])) {
            throw new \RuntimeException('Invalid response from validator: missing "valid" field');
        }

        $errors = [];
        if (!$response['valid'] && isset($response['errors']) && \is_array($response['errors'])) {
            foreach ($response['errors'] as $error) {
                \assert(\is_array($error));
                $errors[] = new ValidationFault(
                    field: (string) ($error['field'] ?? ''),
                    expected: (string) ($error['expected'] ?? ''),
                    received: (string) ($error['received'] ?? ''),
                    message: (string) ($error['message'] ?? ''),
                );
            }
        }

        return new ValidationResult(
            valid: $response['valid'],
            errors: $errors,
        );
    }
}

