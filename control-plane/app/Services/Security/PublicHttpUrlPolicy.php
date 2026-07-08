<?php

declare(strict_types=1);

namespace App\Services\Security;

final class PublicHttpUrlPolicy
{
    /**
     * @param list<string> $allowedHosts
     */
    public function __construct(private readonly array $allowedHosts = [])
    {
    }

    public static function fromConfig(): self
    {
        $hosts = config('services.talos.model_provider_allowed_hosts', []);

        return new self(is_array($hosts) ? array_values(array_filter($hosts, 'is_string')) : []);
    }

    /**
     * @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}
     */
    public function inspect(string $url): array
    {
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = $this->normalizeHost((string) parse_url($url, PHP_URL_HOST));

        if ($host === '' || ! in_array($scheme, ['http', 'https'], true)) {
            return $this->decision(false, 'invalid or unsupported URL', $host, []);
        }

        if ($this->isPrivateHost($host)) {
            return $this->decision(false, 'private network host blocked', $host, []);
        }

        $allowedHosts = array_map($this->normalizeHost(...), $this->allowedHosts);
        if (in_array($host, $allowedHosts, true)) {
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

            if ($this->isPrivateHost($ip)) {
                return $this->decision(false, 'private network host blocked', $host, $resolvedIps);
            }
        }

        return $this->decision(true, 'allowed', $host, $resolvedIps);
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

        $resolved = gethostbynamel($host);

        return is_array($resolved) ? array_values($resolved) : [];
    }

    private function isPrivateHost(string $host): bool
    {
        $ip = filter_var($host, FILTER_VALIDATE_IP);
        if ($ip === false) {
            return in_array($host, ['localhost'], true);
        }

        return ! filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        );
    }

    /**
     * @param list<string> $resolvedIps
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
