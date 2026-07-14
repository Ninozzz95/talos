<?php

declare(strict_types=1);

namespace Kadmos\Workers;

use Kadmos\NodeStatus;
use Kadmos\Security\ExecutionPolicy;

final class HttpRequestWorker implements NodeWorkerInterface
{
    public function __construct(
        private ?ExecutionPolicy $policy = null,
        private ?\Closure $transport = null,
    )
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
        $vettedIps = array_values(array_filter(
            $decision->audit['resolved_ips'] ?? [],
            static fn (mixed $ip): bool => is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) !== false,
        ));

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

        $resolveEntries = $this->curlResolveEntries((string) $url, $vettedIps);
        if ($resolveEntries !== []) {
            $curlOptions[\CURLOPT_RESOLVE] = $resolveEntries;
        }

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

        $transportResult = $this->executeTransport((string) $url, $curlOptions, $ch);
        $rawResponse = $transportResult['raw_response'];
        $curlError = $transportResult['curl_error'];
        $httpCode = $transportResult['http_code'];
        $headerSize = $transportResult['header_size'];
        $primaryIp = $transportResult['primary_ip'];

        // Network failures
        if ($rawResponse === false) {
            return [
                'status' => NodeStatus::FAILED,
                'output_summary' => "Network Error: {$curlError}",
                'raw_output' => null,
            ];
        }

        if ($primaryIp !== null && $vettedIps !== [] && !\in_array($primaryIp, $vettedIps, true)) {
            return [
                'status' => NodeStatus::FAILED,
                'output_summary' => "Blocked by execution policy: DNS rebinding detected for {$primaryIp}",
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

    /**
     * @param list<string> $vettedIps
     * @return list<string>
     */
    private function curlResolveEntries(string $url, array $vettedIps): array
    {
        if ($vettedIps === []) {
            return [];
        }

        $host = (string) \parse_url($url, \PHP_URL_HOST);
        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [];
        }

        $port = (int) (\parse_url($url, \PHP_URL_PORT) ?: (\parse_url($url, \PHP_URL_SCHEME) === 'https' ? 443 : 80));

        return array_map(
            static fn (string $ip): string => "{$host}:{$port}:{$ip}",
            $vettedIps,
        );
    }

    /**
     * @param array<int, mixed> $curlOptions
     * @return array{raw_response: string|false, curl_error: string, http_code: int, header_size: int, primary_ip: ?string}
     */
    private function executeTransport(string $url, array $curlOptions, \CurlHandle $ch): array
    {
        if ($this->transport !== null) {
            $result = ($this->transport)($url, $curlOptions);

            return [
                'raw_response' => $result['raw_response'] ?? false,
                'curl_error' => (string) ($result['curl_error'] ?? ''),
                'http_code' => (int) ($result['http_code'] ?? 0),
                'header_size' => (int) ($result['header_size'] ?? 0),
                'primary_ip' => isset($result['primary_ip']) ? (string) $result['primary_ip'] : null,
            ];
        }

        \curl_setopt_array($ch, $curlOptions);

        return [
            'raw_response' => \curl_exec($ch),
            'curl_error' => \curl_error($ch),
            'http_code' => (int) \curl_getinfo($ch, \CURLINFO_HTTP_CODE),
            'header_size' => (int) \curl_getinfo($ch, \CURLINFO_HEADER_SIZE),
            'primary_ip' => \curl_getinfo($ch, \CURLINFO_PRIMARY_IP) ?: null,
        ];
    }
}
