<?php

declare(strict_types=1);

namespace App\Services\Security;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use LogicException;

final class PublicHttpRequestPinning
{
    public function __construct(
        private readonly ?PublicHttpUrlPolicy $urlPolicy = null,
        private readonly ?bool $curlResolveAvailable = null,
        private readonly bool $requirePrimaryIpEvidence = true,
    ) {
        if (! $this->requirePrimaryIpEvidence && ! app()->environment('testing')) {
            throw new LogicException('Primary-IP evidence can only be relaxed by the test environment.');
        }
    }

    /**
     * @return array{allowed: bool, code: ?string, reason: string, host: string, resolved_ips: list<string>, curl_resolve: list<string>, requires_pinning: bool, trusted_local: bool, policy: array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}}
     */
    public function pin(string $url, bool $trustedLocal = false): array
    {
        if ($trustedLocal) {
            $policy = $this->inspectTrustedLocal($url);
            if (! $policy['allowed']) {
                return $this->decision(false, 'BASE_URL_POLICY_BLOCKED', $policy['reason'], $policy, [], false, false);
            }

            if (! $this->supportsCurlResolve()) {
                return $this->decision(false, 'CONNECTION_PINNING_UNAVAILABLE', 'Local connection pinning is unavailable.', $policy, [], false, true);
            }

            $entries = $this->resolveEntries($url, $policy['resolved_ips']);
            if ($entries === []) {
                return $this->decision(false, 'CONNECTION_PINNING_UNAVAILABLE', 'Local connection pinning could not be configured.', $policy, [], false, true);
            }

            return $this->decision(true, null, 'trusted local provider pinned', $policy, $entries, true, true);
        }

        $policy = ($this->urlPolicy ?? PublicHttpUrlPolicy::fromConfig())->inspect($url, requireResolution: true);

        if (! $policy['allowed']) {
            return $this->decision(false, 'BASE_URL_POLICY_BLOCKED', $policy['reason'], $policy, [], false, false);
        }

        if (! $this->supportsCurlResolve()) {
            return $this->decision(false, 'CONNECTION_PINNING_UNAVAILABLE', 'DNS connection pinning is unavailable.', $policy, [], false, false);
        }

        $entries = $this->resolveEntries($url, $policy['resolved_ips']);
        if ($entries === []) {
            return $this->decision(false, 'CONNECTION_PINNING_UNAVAILABLE', 'DNS connection pinning could not be configured.', $policy, [], false, false);
        }

        return $this->decision(true, null, 'public endpoint pinned', $policy, $entries, true, false);
    }

    /**
     * @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}
     */
    private function inspectTrustedLocal(string $url): array
    {
        try {
            $canonical = CanonicalHttpUrl::fromString($url);
            $host = $canonical->asciiHost;
            $valid = $canonical->query === null
                && $canonical->fragment === null
                && in_array($host, ['localhost', '127.0.0.1', '::1'], true);
        } catch (\InvalidArgumentException) {
            $host = '';
            $valid = false;
        }

        if (! $valid) {
            return [
                'allowed' => false,
                'reason' => 'trusted local endpoint must use an unambiguous loopback URL',
                'host' => $host,
                'resolved_ips' => [],
            ];
        }

        return [
            'allowed' => true,
            'reason' => 'trusted local provider',
            'host' => $host,
            'resolved_ips' => $host === 'localhost' ? ['127.0.0.1', '::1'] : [$host],
        ];
    }

    /**
     * @param  array{allowed: bool, curl_resolve: list<string>, requires_pinning: bool}  $pin
     */
    public function apply(PendingRequest $request, array $pin): PendingRequest
    {
        $request = $request->withoutRedirecting();

        if (! $pin['allowed'] || ! $pin['requires_pinning']) {
            return $request;
        }

        return $request->withOptions([
            'curl' => [CURLOPT_RESOLVE => $pin['curl_resolve']],
        ]);
    }

    /**
     * @param  array{requires_pinning: bool, resolved_ips: list<string>}  $pin
     */
    public function connectedToPinnedIp(Response $response, array $pin): bool
    {
        if (! $pin['requires_pinning']) {
            return true;
        }

        $primaryIp = $response->handlerStats()['primary_ip'] ?? null;
        if (! is_string($primaryIp) || $primaryIp === '') {
            return ! $this->requirePrimaryIpEvidence;
        }

        $primaryBytes = inet_pton($primaryIp);
        if ($primaryBytes === false) {
            return false;
        }

        foreach ($pin['resolved_ips'] as $resolvedIp) {
            $resolvedBytes = inet_pton($resolvedIp);
            if ($resolvedBytes !== false && hash_equals($resolvedBytes, $primaryBytes)) {
                return true;
            }
        }

        return false;
    }

    private function supportsCurlResolve(): bool
    {
        return $this->curlResolveAvailable ?? defined('CURLOPT_RESOLVE');
    }

    /**
     * @param  list<string>  $ips
     * @return list<string>
     */
    private function resolveEntries(string $url, array $ips): array
    {
        try {
            $canonical = CanonicalHttpUrl::fromString($url);
        } catch (\InvalidArgumentException) {
            return [];
        }
        $host = $canonical->asciiHost;
        $port = $canonical->port ?? ($canonical->scheme === 'https' ? 443 : 80);

        return array_values(array_map(
            static fn (string $ip): string => sprintf('%s:%d:%s', $host, (int) $port, str_contains($ip, ':') ? "[{$ip}]" : $ip),
            $ips,
        ));
    }

    /**
     * @param  array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}  $policy
     * @param  list<string>  $entries
     * @return array{allowed: bool, code: ?string, reason: string, host: string, resolved_ips: list<string>, curl_resolve: list<string>, requires_pinning: bool, trusted_local: bool, policy: array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}}
     */
    private function decision(bool $allowed, ?string $code, string $reason, array $policy, array $entries, bool $requiresPinning, bool $trustedLocal): array
    {
        return [
            'allowed' => $allowed,
            'code' => $code,
            'reason' => $reason,
            'host' => $policy['host'],
            'resolved_ips' => $policy['resolved_ips'],
            'curl_resolve' => $entries,
            'requires_pinning' => $requiresPinning,
            'trusted_local' => $trustedLocal,
            'policy' => $policy,
        ];
    }
}
