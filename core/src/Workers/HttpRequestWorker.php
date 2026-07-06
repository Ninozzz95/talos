<?php

declare(strict_types=1);

namespace AVM\Workers;

use AVM\NodeStatus;

final class HttpRequestWorker implements NodeWorkerInterface
{
    public function execute(array $payload): array
    {
        $url = $payload['url'] ?? '';
        $method = strtoupper((string) ($payload['method'] ?? 'GET'));
        $headers = $payload['headers'] ?? [];
        $body = $payload['body'] ?? null;
        $timeoutMs = (int) ($payload['timeout_ms'] ?? 5000);

        $ch = \curl_init($url);
        $curlOptions = [
            \CURLOPT_RETURNTRANSFER => true,
            \CURLOPT_CUSTOMREQUEST => $method,
            \CURLOPT_TIMEOUT_MS => $timeoutMs,
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
            return \substr($output, 0, $maxLength) . "\n...[TRUNCATED BY AVM]";
        }
        return $output;
    }
}
