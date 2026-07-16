<?php

declare(strict_types=1);

namespace App\Services\Security;

use Closure;

final class PublicHttpUrlPolicy
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

    /** @var list<string> */
    private const RESERVED_HOSTNAMES = [
        'localhost',
        'metadata.google.internal',
    ];

    /**
     * @param  list<string>  $allowedHosts
     */
    public function __construct(
        private readonly array $allowedHosts = [],
        private readonly ?Closure $resolver = null,
        private readonly bool $requireAllowedHost = false,
        private readonly bool $rejectQueryAndFragment = false,
        private readonly bool $allowNonPublicAddresses = false,
    ) {}

    /**
     * @param  list<string>  $hosts
     */
    public static function forProviderHosts(array $hosts, ?Closure $resolver = null): self
    {
        return new self(
            allowedHosts: $hosts,
            resolver: $resolver,
            requireAllowedHost: true,
            rejectQueryAndFragment: true,
        );
    }

    /**
     * Operator-owned service endpoints may live on a private container network.
     * The exact hostname remains mandatory and every resolved address is pinned.
     *
     * @param  list<string>  $hosts
     */
    public static function forTrustedServiceHosts(array $hosts, ?Closure $resolver = null): self
    {
        return new self(
            allowedHosts: $hosts,
            resolver: $resolver,
            requireAllowedHost: true,
            rejectQueryAndFragment: true,
            allowNonPublicAddresses: true,
        );
    }

    public static function fromConfig(): self
    {
        $hosts = config('services.talos.model_provider_allowed_hosts', []);

        return self::forProviderHosts(
            is_array($hosts) ? array_values(array_filter($hosts, 'is_string')) : [],
        );
    }

    /**
     * @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}
     */
    public function inspect(string $url, bool $requireResolution = false, bool $resolveHostname = true): array
    {
        try {
            $canonical = CanonicalHttpUrl::fromString($url);
        } catch (\InvalidArgumentException) {
            return $this->decision(false, 'invalid or unsupported URL', '', []);
        }
        $host = $canonical->asciiHost;

        if (($this->rejectQueryAndFragment && ($canonical->query !== null || $canonical->fragment !== null))
            || $host === '') {
            return $this->decision(false, 'invalid or unsupported URL', $host, []);
        }

        $allowedHosts = array_values(array_unique(array_filter(
            array_map($this->normalizeHost(...), $this->allowedHosts),
        )));
        if ($this->requireAllowedHost && ! in_array($host, $allowedHosts, true)) {
            return $this->decision(false, 'host is not allowlisted', $host, []);
        }

        $trustedExactHost = $this->allowNonPublicAddresses && in_array($host, $allowedHosts, true);
        if ((! $trustedExactHost && $this->isReservedHostname($host))
            || (! $trustedExactHost && $this->isPrivateHost($host))) {
            return $this->decision(false, 'private network host blocked', $host, []);
        }

        if (! $resolveHostname) {
            return $this->decision(true, in_array($host, $allowedHosts, true) ? 'allowed host' : 'allowed', $host, []);
        }

        if (! $requireResolution && in_array($host, $allowedHosts, true)) {
            return $this->decision(true, 'allowed host', $host, []);
        }

        $resolvedIps = $this->resolveHostIps($host);
        if ($resolvedIps === []) {
            return $this->decision(false, 'host did not resolve', $host, []);
        }

        foreach ($resolvedIps as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
                return $this->decision(false, 'invalid DNS resolution', $host, $resolvedIps);
            }

            if (! $trustedExactHost && $this->isPrivateHost($ip)) {
                return $this->decision(false, 'private network host blocked', $host, $resolvedIps);
            }
        }

        return $this->decision(true, in_array($host, $allowedHosts, true) ? 'allowed host' : 'allowed', $host, $resolvedIps);
    }

    private function normalizeHost(string $host): string
    {
        $host = strtolower(rtrim(trim($host, "[] \t\n\r\0\x0B"), '.'));
        if ($host === '') {
            return '';
        }

        try {
            $authority = filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false
                ? "[{$host}]"
                : $host;

            return CanonicalHttpUrl::fromString("http://{$authority}/")->asciiHost;
        } catch (\InvalidArgumentException) {
            return '';
        }
    }

    /**
     * @return list<string>
     */
    private function resolveHostIps(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        $resolved = $this->resolver !== null ? ($this->resolver)($host) : $this->systemResolve($host);

        return is_array($resolved)
            ? array_values(array_unique(array_filter($resolved, 'is_string')))
            : [];
    }

    /** @return list<string> */
    private function systemResolve(string $host): array
    {
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
                return $ips;
            }
        }

        return gethostbynamel($host) ?: [];
    }

    private function isPrivateHost(string $host): bool
    {
        $ip = filter_var($host, FILTER_VALIDATE_IP);
        if ($ip === false) {
            return in_array($host, ['localhost'], true);
        }

        if (! filter_var(
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

    private function isReservedHostname(string $host): bool
    {
        return in_array($host, self::RESERVED_HOSTNAMES, true) || str_ends_with($host, '.localhost');
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

    /**
     * @param  list<string>  $resolvedIps
     * @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}
     */
    private function decision(bool $allowed, string $reason, string $host, array $resolvedIps): array
    {
        return [
            'allowed' => $allowed,
            'reason' => $reason,
            'host' => $host,
            'resolved_ips' => $resolvedIps,
        ];
    }
}
