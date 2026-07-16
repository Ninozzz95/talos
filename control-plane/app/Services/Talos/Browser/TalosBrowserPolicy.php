<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Services\Security\CanonicalHttpUrl;
use App\Services\Security\PublicHttpUrlPolicy;

final class TalosBrowserPolicy
{
    /** @param null|callable(string): list<string> $resolver */
    public function __construct(private readonly ?PublicHttpUrlPolicy $publicPolicy = null, private readonly mixed $resolver = null) {}

    /** @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} */
    public function inspect(string $url, bool $requireResolution = true): array
    {
        try {
            $host = CanonicalHttpUrl::fromString($url)->asciiHost;
        } catch (\InvalidArgumentException) {
            return $this->deny('invalid or unsupported URL', '');
        }

        $policy = $this->publicPolicy ?? new PublicHttpUrlPolicy;
        $preflight = $policy->inspect($url, resolveHostname: false);
        if (! $preflight['allowed'] || ! $requireResolution) {
            return $preflight;
        }

        if ($this->resolver === null) {
            return $policy->inspect($url, requireResolution: true);
        }

        $ips = ($this->resolver)($host);
        if (! is_array($ips) || $ips === []) {
            return $this->deny('host did not resolve', $host);
        }
        $ips = array_values($ips);
        foreach ($ips as $ip) {
            if (! is_string($ip)
                || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                return $this->deny('private network host blocked', $host, $ips);
            }
        }

        return ['allowed' => true, 'reason' => 'allowed', 'host' => $host, 'resolved_ips' => $ips];
    }

    /** @param list<string> $ips @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} */
    private function deny(string $reason, string $host, array $ips = []): array
    {
        return ['allowed' => false, 'reason' => $reason, 'host' => $host, 'resolved_ips' => $ips];
    }
}
