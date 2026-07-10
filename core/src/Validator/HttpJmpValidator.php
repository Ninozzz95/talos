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

    public function validate(array $mutations, array $context, ?array $allowedNodeTypes = null, ?array $allowedBrowserOperations = null, bool $browserModeEnabled = false): ValidationResult
    {
        $response = $this->http->postJson($this->validatorUrl, [
            'mutations' => $this->transportMutations($mutations),
            'context' => $context,
            'allowed_node_types' => $allowedNodeTypes,
            'allowed_browser_operations' => $allowedBrowserOperations,
            'browser_mode_enabled' => $browserModeEnabled,
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

    /** @return list<array<string, mixed>> */
    private function transportMutations(array $mutations): array
    {
        foreach ($mutations as $index => $mutation) {
            if (! is_array($mutation) || ($mutation['action'] ?? null) !== 'MUTATE_PAYLOAD') {
                continue;
            }
            $payload = $mutation['payload'] ?? null;
            if (! is_array($payload)
                || ! in_array($payload['operation'] ?? null, ['snapshot', 'screenshot'], true)
                || ($payload['arguments'] ?? null) !== []) {
                continue;
            }

            $mutations[$index]['payload']['arguments'] = new \stdClass();
        }

        return array_values($mutations);
    }
}
