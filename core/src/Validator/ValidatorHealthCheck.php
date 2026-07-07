<?php

declare(strict_types=1);

namespace Kadmos\Validator;

final class ValidatorHealthCheck
{
    public function __construct(
        private string $healthUrl = 'http://127.0.0.1:3000/health',
        private int $timeoutMs = 1000,
        private mixed $probe = null,
    ) {}

    public function isHealthy(): bool
    {
        try {
            if ($this->probe !== null) {
                return (bool) ($this->probe)($this->healthUrl, $this->timeoutMs);
            }

            $ch = \curl_init($this->healthUrl);
            \curl_setopt_array($ch, [
                \CURLOPT_RETURNTRANSFER => true,
                \CURLOPT_TIMEOUT_MS => $this->timeoutMs,
            ]);

            $response = \curl_exec($ch);
            $statusCode = (int) \curl_getinfo($ch, \CURLINFO_RESPONSE_CODE);
            \curl_close($ch);

            if ($response === false || $statusCode !== 200) {
                return false;
            }

            $decoded = \json_decode((string) $response, true);

            return \is_array($decoded) && ($decoded['status'] ?? null) === 'ok';
        } catch (\Throwable) {
            return false;
        }
    }
}

