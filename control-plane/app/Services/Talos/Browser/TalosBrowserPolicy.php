<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Services\Security\PublicHttpUrlPolicy;

final class TalosBrowserPolicy
{
    /** @param null|callable(string): list<string> $resolver */
    public function __construct(private readonly ?PublicHttpUrlPolicy $publicPolicy = null, private readonly mixed $resolver = null) {}
    /** @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} */
    public function inspect(string $url): array
    {
        $parts = parse_url($url);
        $host = is_array($parts) ? strtolower(rtrim((string) ($parts['host'] ?? ''), '.')) : '';
        if (! is_array($parts) || isset($parts['user']) || isset($parts['pass'])) return $this->deny('URL credentials are not allowed.', $host);
        $base = ($this->publicPolicy ?? new PublicHttpUrlPolicy())->inspect($url);
        if (! $base['allowed']) return $base;
        $ips = $this->resolver ? ($this->resolver)($host) : $base['resolved_ips'];
        if (! is_array($ips) || $ips === []) return $this->deny('host did not resolve', $host);
        foreach ($ips as $ip) if (! is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return $this->deny('private network host blocked', $host, $ips);
        return ['allowed' => true, 'reason' => 'allowed', 'host' => $host, 'resolved_ips' => array_values($ips)];
    }
    /** @param list<string> $ips @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} */
    private function deny(string $reason, string $host, array $ips = []): array { return ['allowed' => false, 'reason' => $reason, 'host' => $host, 'resolved_ips' => $ips]; }
}
