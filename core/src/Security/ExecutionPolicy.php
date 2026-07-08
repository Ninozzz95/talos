<?php

declare(strict_types=1);

namespace Kadmos\Security;

final readonly class ExecutionPolicy
{
    /**
     * @param list<string> $allowedHosts
     * @param list<string> $blockedHosts
     */
    public function __construct(
        public array $allowedHosts = [],
        public array $blockedHosts = ['169.254.169.254', 'localhost', '127.0.0.1', '::1'],
        public int $maxTimeoutMs = 10000,
        public bool $allowPrivateNetworks = false,
        private ?\Closure $hostResolver = null,
    ) {
    }

    public function inspectUrl(string $url, int $requestedTimeoutMs): PolicyDecision
    {
        $host = $this->normalizeHost((string) parse_url($url, PHP_URL_HOST));
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $timeoutMs = min(max(1, $requestedTimeoutMs), $this->maxTimeoutMs);
        $audit = [
            'scheme' => $scheme,
            'host' => $host,
            'requested_timeout_ms' => $requestedTimeoutMs,
            'effective_timeout_ms' => $timeoutMs,
            'resolved_ips' => [],
        ];

        if ($host === '' || !in_array($scheme, ['http', 'https'], true)) {
            return $this->decision(false, 'invalid or unsupported URL', $timeoutMs, $audit);
        }

        $allowedHosts = array_map($this->normalizeHost(...), $this->allowedHosts);
        $blockedHosts = array_map($this->normalizeHost(...), $this->blockedHosts);

        if ($allowedHosts !== [] && !in_array($host, $allowedHosts, true)) {
            return $this->decision(false, 'host is not allowlisted', $timeoutMs, $audit);
        }

        if (in_array($host, $blockedHosts, true)) {
            return $this->decision(false, 'blocked ' . $this->hostReason($host), $timeoutMs, $audit);
        }

        if (!$this->allowPrivateNetworks && $this->isPrivateHost($host)) {
            return $this->decision(false, 'private network host blocked', $timeoutMs, $audit);
        }

        $resolvedIps = $this->resolveHostIps($host);
        $audit['resolved_ips'] = $resolvedIps;
        if ($resolvedIps === []) {
            return $this->decision(false, 'host did not resolve', $timeoutMs, $audit);
        }

        foreach ($resolvedIps as $ip) {
            $normalizedIp = $this->normalizeHost($ip);
            if (filter_var($normalizedIp, FILTER_VALIDATE_IP) === false) {
                return $this->decision(false, 'invalid DNS resolution', $timeoutMs, $audit);
            }

            if (in_array($normalizedIp, $blockedHosts, true)) {
                return $this->decision(false, 'blocked ' . $this->hostReason($normalizedIp), $timeoutMs, $audit);
            }

            if (!$this->allowPrivateNetworks && $this->isPrivateHost($normalizedIp)) {
                return $this->decision(false, 'private network host blocked', $timeoutMs, $audit);
            }
        }

        return $this->decision(true, 'allowed', $timeoutMs, $audit);
    }

    /**
     * @param array<string, mixed> $audit
     */
    private function decision(bool $allowed, string $reason, int $timeoutMs, array $audit): PolicyDecision
    {
        return new PolicyDecision($allowed, $reason, $timeoutMs, $audit + [
            'allowed' => $allowed,
            'reason' => $reason,
        ]);
    }

    private function normalizeHost(string $host): string
    {
        return strtolower(rtrim(trim($host, "[] \t\n\r\0\x0B"), '.'));
    }

    /**
     * @return list<string>
     */
    private function resolveHostIps(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        if ($this->hostResolver !== null) {
            $resolved = ($this->hostResolver)($host);
            return array_values(array_filter($resolved, static fn(mixed $ip): bool => is_string($ip) && $ip !== ''));
        }

        $resolved = gethostbynamel($host);
        return is_array($resolved) ? array_values($resolved) : [];
    }

    private function hostReason(string $host): string
    {
        return $host === '169.254.169.254' ? 'metadata IP' : 'localhost';
    }

    private function isPrivateHost(string $host): bool
    {
        $ip = filter_var($host, FILTER_VALIDATE_IP);
        if ($ip === false) {
            return false;
        }

        return !filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        );
    }
}
