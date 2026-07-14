<?php

declare(strict_types=1);

namespace Kadmos\Security;

final readonly class ExecutionPolicy
{
    /** @var list<string> */
    private const NON_PUBLIC_IPV4_RANGES = [
        '0.0.0.0/8',
        '10.0.0.0/8',
        '100.64.0.0/10',
        '127.0.0.0/8',
        '169.254.0.0/16',
        '172.16.0.0/12',
        '192.0.0.0/24',
        '192.0.2.0/24',
        '192.88.99.0/24',
        '192.168.0.0/16',
        '198.18.0.0/15',
        '198.51.100.0/24',
        '203.0.113.0/24',
        '224.0.0.0/4',
        '240.0.0.0/4',
    ];

    /** @var list<string> */
    private const NON_PUBLIC_IPV6_RANGES = [
        '::/128',
        '::1/128',
        '::ffff:0:0/96',
        '5f00::/16',
        '64:ff9b:1::/48',
        '100::/64',
        '100:0:0:1::/64',
        '2001:0::/32',
        '2001:2::/48',
        '2001:10::/28',
        '2001:20::/28',
        '2001:db8::/32',
        '3fff::/20',
        'fc00::/7',
        'fe80::/10',
        'ff00::/8',
    ];

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

    public function inspectUrl(
        string $url,
        int $requestedTimeoutMs,
        bool $requireResolution = true,
        bool $rejectQueryAndFragment = false,
    ): PolicyDecision
    {
        $parts = parse_url($url);
        $host = is_array($parts) ? $this->normalizeHost((string) ($parts['host'] ?? '')) : '';
        $scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
        $timeoutMs = min(max(1, $requestedTimeoutMs), $this->maxTimeoutMs);
        $audit = [
            'scheme' => $scheme,
            'host' => $host,
            'requested_timeout_ms' => $requestedTimeoutMs,
            'effective_timeout_ms' => $timeoutMs,
            'resolved_ips' => [],
        ];

        if (!is_array($parts)
            || isset($parts['user'])
            || isset($parts['pass'])
            || ($rejectQueryAndFragment && (isset($parts['query']) || isset($parts['fragment'])))
            || $host === ''
            || !in_array($scheme, ['http', 'https'], true)
            || !$this->isValidHost($host)) {
            return $this->decision(false, 'invalid or unsupported URL', $timeoutMs, $audit);
        }

        $port = $parts['port'] ?? null;
        if ($port !== null && (!is_int($port) || $port < 1 || $port > 65535)) {
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

        if (!$requireResolution) {
            return $this->decision(true, 'allowed', $timeoutMs, $audit);
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

    private function isValidHost(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return true;
        }

        return filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
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
            return is_array($resolved)
                ? array_values(array_unique(array_filter($resolved, static fn(mixed $ip): bool => is_string($ip) && $ip !== '')))
                : [];
        }

        $records = function_exists('dns_get_record') ? dns_get_record($host, DNS_A | DNS_AAAA) : false;
        if (is_array($records)) {
            $ips = [];
            foreach ($records as $record) {
                if (is_string($record['ip'] ?? null)) {
                    $ips[] = $record['ip'];
                }
                if (is_string($record['ipv6'] ?? null)) {
                    $ips[] = $record['ipv6'];
                }
            }

            if ($ips !== []) {
                return array_values(array_unique($ips));
            }
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

        if (!filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        )) {
            return true;
        }

        $ranges = str_contains($ip, ':')
            ? self::NON_PUBLIC_IPV6_RANGES
            : self::NON_PUBLIC_IPV4_RANGES;

        foreach ($ranges as $range) {
            if ($this->ipInCidr($ip, $range)) {
                return true;
            }
        }

        return false;
    }

    private function ipInCidr(string $ip, string $cidr): bool
    {
        [$network, $prefixLength] = explode('/', $cidr, 2);
        $ipBytes = inet_pton($ip);
        $networkBytes = inet_pton($network);
        $prefixLength = (int) $prefixLength;

        if ($ipBytes === false || $networkBytes === false || strlen($ipBytes) !== strlen($networkBytes)) {
            return false;
        }

        $fullBytes = intdiv($prefixLength, 8);
        if ($fullBytes > 0 && substr($ipBytes, 0, $fullBytes) !== substr($networkBytes, 0, $fullBytes)) {
            return false;
        }

        $remainingBits = $prefixLength % 8;
        if ($remainingBits === 0) {
            return true;
        }

        $mask = (0xFF << (8 - $remainingBits)) & 0xFF;

        return (ord($ipBytes[$fullBytes]) & $mask) === (ord($networkBytes[$fullBytes]) & $mask);
    }
}
