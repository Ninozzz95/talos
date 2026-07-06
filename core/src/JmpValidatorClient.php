<?php

declare(strict_types=1);

namespace AVM;

final class JmpValidatorClient
{
    public function __construct(
        private HttpClientInterface $http,
        private string $validatorUrl = 'http://127.0.0.1:3000/validate',
    ) {}

    /**
     * @param list<array<string, mixed>> $mutations
     * @param array<string, string> $context  node_id => node_type
     */
    public function validate(array $mutations, array $context): ValidationResult
    {
        $body = [
            'mutations' => $mutations,
            'context' => $context,
        ];

        $response = $this->http->postJson($this->validatorUrl, $body);

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
