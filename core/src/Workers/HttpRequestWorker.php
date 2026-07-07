<?php

declare(strict_types=1);

namespace Kadmos\Workers;

use Kadmos\NodeStatus;
use Kadmos\Security\ExecutionPolicy;

final class HttpRequestWorker implements NodeWorkerInterface
{
    public function __construct(private ?ExecutionPolicy $policy = null)
    {
    }

    public function execute(array $payload): array
    {
        $url = $payload['url'] ?? '';
        $method = strtoupper((string) ($payload['method'] ?? 'GET'));
        $headers = $payload['headers'] ?? [];
        $body = $payload['body'] ?? null;
        $timeoutMs = (int) ($payload['timeout_ms'] ?? 5000);
        $policy = $this->policy ?? new ExecutionPolicy();
        $decision = $policy->inspectUrl((string) $url, $timeoutMs);

        if (!$decision->allowed) {
            return [
                'status' => NodeStatus::FAILED,
                'output_summary' => "Blocked by execution policy: {$decision->reason}",
                'raw_output' => null,
            ];
        }

        $ch = \curl_init($url);
        $curlOptions = [
            \CURLOPT_RETURNTRANSFER => true,
            \CURLOPT_CUSTOMREQUEST => $method,
            \CURLOPT_TIMEOUT_MS => $decision->timeoutMs,
            \CURLOPT_HEADER => true,
        ];

        // Format headers for cURL
        $formattedHeaders = [];
        if (\is_array($headers)) {
            foreach ($headers as $key => $value) {
                $formattedHeaders[] = "{$key}: {$value}";
            }
        }
        if (!empty($formattedHeaders)) {
            $curlOptions[\CURLOPT_HTTPHEADER] = $formattedHeaders;
        }

        // Handle body for write methods
        if ($body !== null && \in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $curlOptions[\CURLOPT_POSTFIELDS] = \is_array($body) ? \json_encode($body) : $body;
        }

        \curl_setopt_array($ch, $curlOptions);

        // Physical execution
        $rawResponse = \curl_exec($ch);
        $curlError = \curl_error($ch);
        $httpCode = \curl_getinfo($ch, \CURLINFO_HTTP_CODE);
        $headerSize = \curl_getinfo($ch, \CURLINFO_HEADER_SIZE);

        // Network failures
        if ($rawResponse === false) {
            return [
                'status' => NodeStatus::FAILED,
                'output_summary' => "Network Error: {$curlError}",
                'raw_output' => null,
            ];
        }

        $responseBody = \substr($rawResponse, $headerSize);

        // Success
        if ($httpCode >= 200 && $httpCode < 300) {
            return [
                'status' => NodeStatus::SUCCESS,
                'output_summary' => "HTTP {$httpCode} OK",
                'raw_output' => $this->truncateOutput($responseBody),
            ];
        }

        // Application-level failure
        return [
            'status' => NodeStatus::FAILED,
            'output_summary' => "HTTP Error {$httpCode}",
            'raw_output' => $this->truncateOutput($responseBody),
        ];
    }

    private function truncateOutput(string $output, int $maxLength = 2000): string
    {
        if (\strlen($output) > $maxLength) {
            return \substr($output, 0, $maxLength) . "\n...[TRUNCATED BY KADMOS]";
        }
        return $output;
    }
}
