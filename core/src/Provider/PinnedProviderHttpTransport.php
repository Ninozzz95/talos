<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use Kadmos\Security\ExecutionPolicy;
use Kadmos\Security\PolicyDecision;
use RuntimeException;

final class PinnedProviderHttpTransport implements ProviderTransport, StreamingProviderTransport
{
    private const MAX_STREAM_QUEUE_BYTES = 2_097_152;
    private const MAX_ERROR_BODY_BYTES = 65_536;

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

    /**
     * @param array<string, mixed> $payload
     * @param list<string> $headers
     * @return iterable<string>
     */
    public function stream(
        string $endpoint,
        array $payload,
        array $headers,
        int $timeoutMs,
        \Closure $isCancelled,
    ): iterable {
        if ($this->isCancelled($isCancelled)) {
            throw new ProviderStreamCancelledException('user_requested');
        }

        $decision = $this->endpointDecision(
            $endpoint,
            $timeoutMs,
            requireResolution: true,
            allowGeminiSseQuery: true,
        );
        $resolveEntries = $this->curlResolveEntries($endpoint, $decision);
        if ($resolveEntries === []) {
            throw new RuntimeException('Provider connection could not be pinned to an approved IP address.');
        }

        $queue = [];
        $queueBytes = 0;
        $cancelled = false;
        $overflow = false;
        $write = function (mixed $handle, string $chunk) use (
            &$queue,
            &$queueBytes,
            &$cancelled,
            &$overflow,
            $isCancelled,
        ): int {
            if ($this->isCancelled($isCancelled)) {
                $cancelled = true;

                return 0;
            }
            $length = strlen($chunk);
            if ($queueBytes + $length > self::MAX_STREAM_QUEUE_BYTES) {
                $overflow = true;

                return 0;
            }
            $queue[] = $chunk;
            $queueBytes += $length;

            return $length;
        };
        $progress = function (
            mixed $handle,
            float $downloadSize,
            float $downloaded,
            float $uploadSize,
            float $uploaded,
        ) use (&$cancelled, $isCancelled): int {
            if ($this->isCancelled($isCancelled)) {
                $cancelled = true;

                return 1;
            }

            return 0;
        };

        $options = [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT_MS => $decision->timeoutMs,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_RESOLVE => $resolveEntries,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_XFERINFOFUNCTION => $progress,
            CURLOPT_WRITEFUNCTION => $write,
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
            if ($cancelled) {
                throw new ProviderStreamCancelledException('user_requested');
            }
            if ($overflow) {
                throw new RuntimeException('Provider stream callback queue exceeded its byte limit.');
            }
            $response = $result['raw_response'] ?? false;
            $error = is_string($result['curl_error'] ?? null) ? $result['curl_error'] : '';
            $httpCode = is_int($result['http_code'] ?? null) ? $result['http_code'] : 0;
            $primaryIp = is_string($result['primary_ip'] ?? null) && $result['primary_ip'] !== ''
                ? $result['primary_ip']
                : null;
            if ($response === false) {
                throw new RuntimeException('Provider API unreachable: '.$error);
            }
            if (! $this->connectedToApprovedIp($primaryIp, $decision)) {
                throw new RuntimeException('Provider connection did not use an approved IP address.');
            }
            if ($httpCode < 200 || $httpCode >= 300) {
                throw new ProviderRequestException(
                    $httpCode,
                    substr(implode('', $queue), 0, self::MAX_ERROR_BODY_BYTES),
                );
            }
            foreach ($queue as $providerChunk) {
                yield $providerChunk;
            }

            return;
        }

        yield from $this->streamWithNativeCurl(
            $endpoint,
            $options,
            $decision,
            $isCancelled,
            $queue,
            $queueBytes,
            $cancelled,
            $overflow,
        );
    }

    public function assertEndpointAllowed(string $endpoint, int $timeoutMs): void
    {
        $this->endpointDecision($endpoint, $timeoutMs, requireResolution: false);
    }

    private function endpointDecision(
        string $endpoint,
        int $timeoutMs,
        bool $requireResolution,
        bool $allowGeminiSseQuery = false,
    ): PolicyDecision
    {
        $rejectQueryAndFragment = true;
        if ($allowGeminiSseQuery
            && $this->provider === 'gemini'
            && $this->isExactGeminiSseEndpoint($endpoint)) {
            $rejectQueryAndFragment = false;
        }
        $decision = $this->provider === 'ollama'
            ? $this->ollamaDecision($endpoint, $timeoutMs)
            : $this->executionPolicy->inspectUrl(
                $endpoint,
                $timeoutMs,
                requireResolution: $requireResolution,
                rejectQueryAndFragment: $rejectQueryAndFragment,
            );
        if (! $decision->allowed) {
            throw new RuntimeException('Provider endpoint blocked by execution policy: '.$decision->reason);
        }

        return $decision;
    }

    /**
     * @param array<int, mixed> $options
     * @param list<string> $queue
     * @return iterable<string>
     */
    private function streamWithNativeCurl(
        string $endpoint,
        array $options,
        PolicyDecision $decision,
        \Closure $isCancelled,
        array &$queue,
        int &$queueBytes,
        bool &$cancelled,
        bool &$overflow,
    ): iterable {
        $handle = curl_init($endpoint);
        if ($handle === false) {
            throw new RuntimeException('Provider transport could not be initialized.');
        }
        curl_setopt_array($handle, $options);
        $multi = curl_multi_init();
        curl_multi_add_handle($multi, $handle);
        $running = null;
        $resultCode = CURLE_OK;
        $errorBody = '';

        try {
            do {
                if ($this->isCancelled($isCancelled)) {
                    $cancelled = true;
                    throw new ProviderStreamCancelledException('user_requested');
                }
                do {
                    $multiStatus = curl_multi_exec($multi, $running);
                } while ($multiStatus === CURLM_CALL_MULTI_PERFORM);
                if ($multiStatus !== CURLM_OK) {
                    throw new RuntimeException('Provider streaming transport failed to advance.');
                }

                $httpCode = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
                $connectedIp = curl_getinfo($handle, CURLINFO_PRIMARY_IP);
                $primaryIp = is_string($connectedIp) && $connectedIp !== '' ? $connectedIp : null;
                if ($queue !== [] && $httpCode !== 0) {
                    if (! $this->connectedToApprovedIp($primaryIp, $decision)) {
                        throw new RuntimeException('Provider connection did not use an approved IP address.');
                    }
                    if ($httpCode >= 200 && $httpCode < 300) {
                        $ready = $queue;
                        $queue = [];
                        $queueBytes = 0;
                        foreach ($ready as $providerChunk) {
                            yield $providerChunk;
                        }
                    } else {
                        $errorBody .= implode('', $queue);
                        $errorBody = substr($errorBody, 0, self::MAX_ERROR_BODY_BYTES);
                        $queue = [];
                        $queueBytes = 0;
                    }
                }
                while (($info = curl_multi_info_read($multi)) !== false) {
                    if (($info['handle'] ?? null) === $handle && is_int($info['result'] ?? null)) {
                        $resultCode = $info['result'];
                    }
                }
                if ($running > 0) {
                    $selected = curl_multi_select($multi, 0.1);
                    if ($selected === -1) {
                        usleep(10_000);
                    }
                }
            } while ($running > 0);

            if ($cancelled) {
                throw new ProviderStreamCancelledException('user_requested');
            }
            if ($overflow) {
                throw new RuntimeException('Provider stream callback queue exceeded its byte limit.');
            }

            $httpCode = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
            $connectedIp = curl_getinfo($handle, CURLINFO_PRIMARY_IP);
            $primaryIp = is_string($connectedIp) && $connectedIp !== '' ? $connectedIp : null;
            if (! $this->connectedToApprovedIp($primaryIp, $decision)) {
                throw new RuntimeException('Provider connection did not use an approved IP address.');
            }
            if ($queue !== []) {
                if ($httpCode >= 200 && $httpCode < 300) {
                    foreach ($queue as $providerChunk) {
                        yield $providerChunk;
                    }
                } else {
                    $errorBody .= implode('', $queue);
                    $errorBody = substr($errorBody, 0, self::MAX_ERROR_BODY_BYTES);
                }
                $queue = [];
                $queueBytes = 0;
            }
            if ($httpCode < 200 || $httpCode >= 300) {
                throw new ProviderRequestException($httpCode, $errorBody);
            }
            if ($resultCode !== CURLE_OK) {
                throw new RuntimeException('Provider streaming API unreachable: '.curl_error($handle));
            }
        } finally {
            curl_multi_remove_handle($multi, $handle);
            curl_multi_close($multi);
            curl_close($handle);
        }
    }

    private function isCancelled(\Closure $isCancelled): bool
    {
        $cancelled = $isCancelled();
        if (! is_bool($cancelled)) {
            throw new RuntimeException('Provider stream cancellation callback must return a boolean.');
        }

        return $cancelled;
    }

    private function isExactGeminiSseEndpoint(string $endpoint): bool
    {
        $parts = parse_url($endpoint);

        return is_array($parts)
            && ! isset($parts['fragment'])
            && ($parts['query'] ?? null) === 'alt=sse'
            && str_ends_with((string) ($parts['path'] ?? ''), ':streamGenerateContent');
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

        $addresses = array_map(
            static fn (string $ip): string => str_contains($ip, ':') ? '['.$ip.']' : $ip,
            $resolvedIps,
        );

        return $addresses === []
            ? []
            : [sprintf('%s:%d:%s', $host, (int) $port, implode(',', $addresses))];
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
