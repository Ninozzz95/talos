<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use Kadmos\Security\ExecutionPolicy;
use Kadmos\Security\PolicyDecision;
use RuntimeException;

final class PinnedProviderHttpTransport implements ProviderTransport
{
    private readonly string $provider;
    private readonly ExecutionPolicy $executionPolicy;
    private readonly ?\Closure $curlTransport;

    public function __construct(
        string $provider,
        ?ExecutionPolicy $executionPolicy = null,
        ?callable $curlTransport = null,
        int $maxTimeoutMs = 120000,
    ) {
        $provider = strtolower(trim($provider));
        if ($provider === '') {
            throw new InvalidArgumentException('Pinned provider transport requires a provider.');
        }
        $this->provider = $provider;
        if ($maxTimeoutMs < 1) {
            throw new InvalidArgumentException('Pinned provider transport timeout must be positive.');
        }
        $defaultHosts = self::defaultHosts($provider);
        if ($provider !== 'ollama' && $defaultHosts === [] && $executionPolicy === null) {
            throw new InvalidArgumentException('Unknown or custom providers require an explicit execution policy.');
        }
        $this->executionPolicy = $executionPolicy ?? new ExecutionPolicy(
            allowedHosts: $defaultHosts,
            maxTimeoutMs: $maxTimeoutMs,
        );
        $this->curlTransport = $curlTransport !== null ? \Closure::fromCallable($curlTransport) : null;
    }

    /**
     * @param array<string, mixed> $payload
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    public function __invoke(string $endpoint, array $payload, array $headers, int $timeoutMs): array
    {
        return $this->send($endpoint, $payload, $headers, $timeoutMs);
    }

    /**
     * @param array<string, mixed> $payload
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    public function send(string $endpoint, array $payload, array $headers, int $timeoutMs): array
    {
        $decision = $this->endpointDecision($endpoint, $timeoutMs, requireResolution: true);

        $resolveEntries = $this->curlResolveEntries($endpoint, $decision);
        if ($resolveEntries === []) {
            throw new RuntimeException('Provider connection could not be pinned to an approved IP address.');
        }
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT_MS => $decision->timeoutMs,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_RESOLVE => $resolveEntries,
        ];
        $insecureSsl = getenv('KADMOS_INSECURE_SSL') === '1';
        if ($insecureSsl) {
            fwrite(STDERR, "WARNING: SSL verification disabled by KADMOS_INSECURE_SSL=1. Do not use in enterprise mode.\n");
            $options[CURLOPT_SSL_VERIFYPEER] = false;
            $options[CURLOPT_SSL_VERIFYHOST] = 0;
        } else {
            $options[CURLOPT_SSL_VERIFYPEER] = true;
            $options[CURLOPT_SSL_VERIFYHOST] = 2;
        }

        if ($this->curlTransport !== null) {
            $result = ($this->curlTransport)($endpoint, $options);
            if (! is_array($result)) {
                throw new RuntimeException('Provider cURL transport returned an invalid result.');
            }
            $response = $result['raw_response'] ?? false;
            $error = is_string($result['curl_error'] ?? null) ? $result['curl_error'] : '';
            $httpCode = is_int($result['http_code'] ?? null) ? $result['http_code'] : 0;
            $primaryIp = is_string($result['primary_ip'] ?? null) && $result['primary_ip'] !== ''
                ? $result['primary_ip']
                : null;
        } else {
            $handle = curl_init($endpoint);
            if ($handle === false) {
                throw new RuntimeException('Provider transport could not be initialized.');
            }
            curl_setopt_array($handle, $options);
            $response = curl_exec($handle);
            $error = curl_error($handle);
            $httpCode = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
            $connectedIp = curl_getinfo($handle, CURLINFO_PRIMARY_IP);
            $primaryIp = is_string($connectedIp) && $connectedIp !== '' ? $connectedIp : null;
        }

        if ($response === false) {
            throw new RuntimeException('Provider API unreachable: '.$error);
        }
        if (! $this->connectedToApprovedIp($primaryIp, $decision)) {
            throw new RuntimeException('Provider connection did not use an approved IP address.');
        }
        if ($httpCode >= 300) {
            throw new ProviderRequestException($httpCode, (string) $response);
        }

        $decoded = json_decode((string) $response, true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($decoded)) {
            throw new RuntimeException('Provider response must be a JSON object.');
        }

        return $decoded;
    }

    public function assertEndpointAllowed(string $endpoint, int $timeoutMs): void
    {
        $this->endpointDecision($endpoint, $timeoutMs, requireResolution: false);
    }

    private function endpointDecision(string $endpoint, int $timeoutMs, bool $requireResolution): PolicyDecision
    {
        $decision = $this->provider === 'ollama'
            ? $this->ollamaDecision($endpoint, $timeoutMs)
            : $this->executionPolicy->inspectUrl(
                $endpoint,
                $timeoutMs,
                requireResolution: $requireResolution,
                rejectQueryAndFragment: true,
            );
        if (! $decision->allowed) {
            throw new RuntimeException('Provider endpoint blocked by execution policy: '.$decision->reason);
        }

        return $decision;
    }

    private function ollamaDecision(string $endpoint, int $timeoutMs): PolicyDecision
    {
        $parts = parse_url($endpoint);
        $scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
        $host = is_array($parts) ? self::normalizeHost((string) ($parts['host'] ?? '')) : '';
        if (! is_array($parts)
            || ! in_array($scheme, ['http', 'https'], true)
            || ! in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            return new PolicyDecision(false, 'Ollama endpoint must use loopback only', max(1, $timeoutMs), []);
        }
        $resolvedIps = match ($host) {
            'localhost' => ['127.0.0.1', '::1'],
            default => [$host],
        };

        return new PolicyDecision(true, 'trusted local provider', max(1, $timeoutMs), [
            'host' => $host,
            'resolved_ips' => $resolvedIps,
        ]);
    }

    /** @return list<string> */
    private function curlResolveEntries(string $endpoint, PolicyDecision $decision): array
    {
        $host = self::normalizeHost((string) parse_url($endpoint, PHP_URL_HOST));
        $scheme = strtolower((string) parse_url($endpoint, PHP_URL_SCHEME));
        $port = parse_url($endpoint, PHP_URL_PORT) ?: ($scheme === 'https' ? 443 : 80);
        $resolvedIps = is_array($decision->audit['resolved_ips'] ?? null)
            ? array_values(array_filter($decision->audit['resolved_ips'], 'is_string'))
            : [];
        if ($host === '' || (! is_int($port) && ! is_numeric($port))) {
            return [];
        }

        return array_map(
            static fn (string $ip): string => sprintf(
                '%s:%d:%s',
                $host,
                (int) $port,
                str_contains($ip, ':') ? '['.$ip.']' : $ip,
            ),
            $resolvedIps,
        );
    }

    private function connectedToApprovedIp(?string $primaryIp, PolicyDecision $decision): bool
    {
        if ($primaryIp === null || filter_var($primaryIp, FILTER_VALIDATE_IP) === false) {
            return false;
        }
        $resolvedIps = is_array($decision->audit['resolved_ips'] ?? null)
            ? array_filter($decision->audit['resolved_ips'], 'is_string')
            : [];
        foreach ($resolvedIps as $resolvedIp) {
            $primaryBytes = inet_pton($primaryIp);
            $resolvedBytes = inet_pton($resolvedIp);
            if ($primaryBytes !== false && $resolvedBytes !== false && hash_equals($resolvedBytes, $primaryBytes)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    private static function defaultHosts(string $provider): array
    {
        return match ($provider) {
            'openai' => ['api.openai.com'],
            'deepseek' => ['api.deepseek.com'],
            'anthropic' => ['api.anthropic.com'],
            'gemini' => ['generativelanguage.googleapis.com'],
            'openrouter' => ['openrouter.ai'],
            'groq' => ['api.groq.com'],
            'ollama' => [],
            default => [],
        };
    }

    private static function normalizeHost(string $host): string
    {
        return strtolower(rtrim(trim($host, "[] \t\n\r\0\x0B"), '.'));
    }
}
