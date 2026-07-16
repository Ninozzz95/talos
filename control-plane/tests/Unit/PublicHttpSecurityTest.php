<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Security\CanonicalHttpUrl;
use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use GuzzleHttp\Psr7\Request as PsrRequest;
use GuzzleHttp\Psr7\Response as PsrResponse;
use GuzzleHttp\TransferStats;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class PublicHttpSecurityTest extends TestCase
{
    public function test_whatwg_canonicalization_is_shared_by_policy_and_connection_pinning(): void
    {
        $url = 'HTTPS://B'."\u{00DC}".'CHER.DE.:8443/a/../v1/chat/completions';
        $resolvedHost = null;
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            ['b'."\u{00FC}".'cher.de.'],
            static function (string $host) use (&$resolvedHost): array {
                $resolvedHost = $host;

                return ['93.184.216.34'];
            },
        );

        $canonical = CanonicalHttpUrl::fromString($url);
        $pin = (new PublicHttpRequestPinning(
            $policy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ))->pin($url);

        $this->assertSame('https://xn--bcher-kva.de:8443/v1/chat/completions', $canonical->asciiUrl);
        $this->assertSame('xn--bcher-kva.de', $canonical->asciiHost);
        $this->assertSame('b'."\u{00FC}".'cher.de', $canonical->unicodeHost);
        $this->assertSame('xn--bcher-kva.de', $resolvedHost);
        $this->assertTrue($pin['allowed']);
        $this->assertSame(['xn--bcher-kva.de:8443:93.184.216.34'], $pin['curl_resolve']);
    }

    public function test_whatwg_parser_rejects_credentials_malformed_ports_and_blocks_trailing_dot_localhost(): void
    {
        $policy = new PublicHttpUrlPolicy(
            resolver: static fn (string $host): array => ['93.184.216.34'],
        );

        foreach ([
            'https://user:pass@example.com/private',
            'https://example.com:70000/private',
        ] as $invalidUrl) {
            $decision = $policy->inspect($invalidUrl, requireResolution: true);

            $this->assertFalse($decision['allowed'], $invalidUrl);
            $this->assertSame('invalid or unsupported URL', $decision['reason'], $invalidUrl);
        }

        $localhost = $policy->inspect('http://LOCALHOST.:80/private', requireResolution: true);

        $this->assertFalse($localhost['allowed']);
        $this->assertSame('localhost', $localhost['host']);
        $this->assertSame('private network host blocked', $localhost['reason']);
    }

    public function test_mixed_public_and_private_dns_answers_are_denied_as_one_fail_closed_decision(): void
    {
        $policy = new PublicHttpUrlPolicy(
            resolver: static fn (string $host): array => ['93.184.216.34', '169.254.169.254'],
        );

        $decision = $policy->inspect('https://mixed.example/path', requireResolution: true);

        $this->assertFalse($decision['allowed']);
        $this->assertSame('private network host blocked', $decision['reason']);
        $this->assertSame(['93.184.216.34', '169.254.169.254'], $decision['resolved_ips']);
    }

    public function test_default_connection_pinning_rejects_missing_primary_ip_evidence(): void
    {
        $pinning = $this->pinning();
        $pin = $pinning->pin('https://provider.example/v1/chat/completions');

        $this->assertTrue($pin['allowed']);
        $this->assertFalse($pinning->connectedToPinnedIp($this->responseWithStats([
            'total_time' => 0.012,
        ]), $pin));
    }

    public function test_missing_primary_ip_can_only_be_relaxed_by_explicit_injected_test_policy(): void
    {
        $pinning = new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['provider.example'],
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        );
        $pin = $pinning->pin('https://provider.example/v1/chat/completions');

        $this->assertTrue($pinning->connectedToPinnedIp($this->responseWithStats([
            'total_time' => 0.012,
        ]), $pin));
    }

    public function test_primary_ip_relaxation_cannot_be_enabled_outside_the_testing_environment(): void
    {
        $this->app['env'] = 'production';

        $this->expectException(LogicException::class);

        new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['provider.example'],
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        );
    }

    public function test_primary_ip_handler_stat_must_match_the_pinned_resolution(): void
    {
        $pinning = $this->pinning();
        $pin = $pinning->pin('https://provider.example/v1/chat/completions');

        $this->assertTrue($pinning->connectedToPinnedIp($this->responseWithStats([
            'primary_ip' => '93.184.216.34',
            'total_time' => 0.018,
        ]), $pin));
        $this->assertFalse($pinning->connectedToPinnedIp($this->responseWithStats([
            'primary_ip' => '198.51.100.44',
            'total_time' => 0.018,
        ]), $pin));
    }

    public function test_primary_ip_comparison_accepts_equivalent_ipv6_notation(): void
    {
        $pinning = new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['provider.example'],
                static fn (string $host): array => ['2001:4860:4860::8888'],
            ),
            curlResolveAvailable: true,
        );
        $pin = $pinning->pin('https://provider.example/v1/chat/completions');

        $this->assertTrue($pinning->connectedToPinnedIp($this->responseWithStats([
            'primary_ip' => '2001:4860:4860:0:0:0:0:8888',
        ]), $pin));
    }

    public function test_applied_transport_options_disable_redirects_and_pin_dns_resolution(): void
    {
        $seenOptions = null;
        Http::fake(function (Request $request, array $options) use (&$seenOptions) {
            $seenOptions = $options;

            return Http::response(['ok' => true]);
        });

        $pinning = $this->pinning();
        $pin = $pinning->pin('https://provider.example/v1/chat/completions');
        $pinning->apply(Http::timeout(5), $pin)->post('https://provider.example/v1/chat/completions', []);

        $this->assertIsArray($seenOptions);
        $this->assertSame(false, $seenOptions['allow_redirects']);
        $this->assertSame($pin['curl_resolve'], $seenOptions['curl'][CURLOPT_RESOLVE]);
    }

    public function test_trusted_local_provider_is_pinned_to_loopback_and_verifies_the_connected_ip(): void
    {
        $pinning = new PublicHttpRequestPinning(curlResolveAvailable: true);
        $pin = $pinning->pin('http://localhost:11434/v1/chat/completions', trustedLocal: true);

        $this->assertTrue($pin['allowed']);
        $this->assertTrue($pin['requires_pinning']);
        $this->assertSame(['127.0.0.1', '::1'], $pin['resolved_ips']);
        $this->assertSame([
            'localhost:11434:127.0.0.1',
            'localhost:11434:[::1]',
        ], $pin['curl_resolve']);
        $this->assertTrue($pinning->connectedToPinnedIp($this->responseWithStats([
            'primary_ip' => '127.0.0.1',
        ]), $pin));
        $this->assertFalse($pinning->connectedToPinnedIp($this->responseWithStats([
            'primary_ip' => '93.184.216.34',
        ]), $pin));
    }

    public function test_trusted_local_flag_cannot_bypass_loopback_url_validation(): void
    {
        $pinning = new PublicHttpRequestPinning(curlResolveAvailable: true);
        $pin = $pinning->pin('https://provider.example/v1/chat/completions', trustedLocal: true);

        $this->assertFalse($pin['allowed']);
        $this->assertSame('BASE_URL_POLICY_BLOCKED', $pin['code']);
        $this->assertFalse($pin['trusted_local']);
    }

    public function test_provider_policy_rejects_public_host_outside_allowlist_before_dns_resolution(): void
    {
        $resolutionAttempts = 0;
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            ['api.openai.com'],
            static function (string $host) use (&$resolutionAttempts): array {
                $resolutionAttempts++;

                return ['93.184.216.34'];
            },
        );

        $decision = $policy->inspect('https://public-but-unlisted.example/v1', requireResolution: true);

        $this->assertFalse($decision['allowed']);
        $this->assertSame('host is not allowlisted', $decision['reason']);
        $this->assertSame(0, $resolutionAttempts);
    }

    public function test_no_dns_mode_skips_hostname_resolution_but_keeps_literal_and_reserved_host_blocks(): void
    {
        $resolutionAttempts = 0;
        $policy = new PublicHttpUrlPolicy(
            resolver: static function (string $host) use (&$resolutionAttempts): array {
                $resolutionAttempts++;

                return ['93.184.216.34'];
            },
        );

        $allowed = $policy->inspect(
            'https://never-resolves.example/path',
            requireResolution: true,
            resolveHostname: false,
        );

        $this->assertTrue($allowed['allowed']);
        $this->assertSame([], $allowed['resolved_ips']);
        $this->assertSame(0, $resolutionAttempts);

        foreach ([
            'http://localhost/path',
            'http://worker.localhost/path',
            'http://metadata.google.internal/path',
            'http://127.0.0.1/path',
            'http://169.254.169.254/latest/meta-data',
        ] as $blockedUrl) {
            $decision = $policy->inspect($blockedUrl, resolveHostname: false);

            $this->assertFalse($decision['allowed'], $blockedUrl);
            $this->assertSame('private network host blocked', $decision['reason'], $blockedUrl);
        }
    }

    public function test_trusted_configured_service_policy_pins_an_exact_private_service_without_weakening_public_urls(): void
    {
        $resolver = static fn (string $host): array => $host === 'searxng'
            ? ['172.24.0.12']
            : [];
        $trustedPolicy = PublicHttpUrlPolicy::forTrustedServiceHosts(['searxng'], $resolver);
        $publicPolicy = new PublicHttpUrlPolicy(resolver: $resolver);

        $trustedDecision = $trustedPolicy->inspect('http://searxng:8080/search', requireResolution: true);
        $publicDecision = $publicPolicy->inspect('http://searxng:8080/search', requireResolution: true);
        $unlistedDecision = $trustedPolicy->inspect('http://metadata:8080/search', requireResolution: true);

        $this->assertTrue($trustedDecision['allowed']);
        $this->assertSame(['172.24.0.12'], $trustedDecision['resolved_ips']);
        $this->assertFalse($publicDecision['allowed']);
        $this->assertSame('private network host blocked', $publicDecision['reason']);
        $this->assertFalse($unlistedDecision['allowed']);
        $this->assertSame('host is not allowlisted', $unlistedDecision['reason']);

        $pinning = new PublicHttpRequestPinning(
            $trustedPolicy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        );
        $pin = $pinning->pin('http://searxng:8080/search');

        $this->assertTrue($pin['allowed']);
        $this->assertSame(['searxng:8080:172.24.0.12'], $pin['curl_resolve']);
    }

    public function test_exact_allowlisted_trusted_loopback_hosts_resolve_and_pin_while_generic_no_dns_policy_rejects_them(): void
    {
        $localhostPolicy = PublicHttpUrlPolicy::forTrustedServiceHosts(
            ['localhost'],
            static fn (string $host): array => ['127.0.0.1', '::1'],
        );
        $localhostDecision = $localhostPolicy->inspect('http://localhost:8080/search', requireResolution: true);
        $localhostPin = (new PublicHttpRequestPinning(
            $localhostPolicy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ))->pin('http://localhost:8080/search');

        $literalPolicy = PublicHttpUrlPolicy::forTrustedServiceHosts(['127.0.0.1']);
        $literalDecision = $literalPolicy->inspect('http://127.0.0.1:8080/search', requireResolution: true);
        $literalPin = (new PublicHttpRequestPinning(
            $literalPolicy,
            curlResolveAvailable: true,
            requirePrimaryIpEvidence: false,
        ))->pin('http://127.0.0.1:8080/search');

        $genericPolicy = new PublicHttpUrlPolicy(
            resolver: static fn (string $host): array => throw new \RuntimeException('generic policy must not resolve in no-DNS mode'),
        );

        $this->assertTrue($localhostDecision['allowed']);
        $this->assertSame(['127.0.0.1', '::1'], $localhostDecision['resolved_ips']);
        $this->assertTrue($localhostPin['allowed']);
        $this->assertSame([
            'localhost:8080:127.0.0.1',
            'localhost:8080:[::1]',
        ], $localhostPin['curl_resolve']);
        $this->assertTrue($literalDecision['allowed']);
        $this->assertSame(['127.0.0.1'], $literalDecision['resolved_ips']);
        $this->assertTrue($literalPin['allowed']);
        $this->assertSame(['127.0.0.1:8080:127.0.0.1'], $literalPin['curl_resolve']);

        foreach (['http://localhost:8080/search', 'http://127.0.0.1:8080/search'] as $url) {
            $decision = $genericPolicy->inspect($url, resolveHostname: false);

            $this->assertFalse($decision['allowed'], $url);
            $this->assertSame('private network host blocked', $decision['reason'], $url);
        }
    }

    #[DataProvider('unsafeProviderUrls')]
    public function test_provider_policy_rejects_credential_bearing_or_ambiguous_url_components(string $url): void
    {
        $policy = PublicHttpUrlPolicy::forProviderHosts(
            ['api.openai.com'],
            static fn (string $host): array => ['93.184.216.34'],
        );

        $decision = $policy->inspect($url);

        $this->assertFalse($decision['allowed'], $url);
        $this->assertSame('invalid or unsupported URL', $decision['reason']);
    }

    #[DataProvider('nonPublicIpRanges')]
    public function test_public_url_policy_rejects_non_public_special_use_ip_ranges(string $ip): void
    {
        $policy = new PublicHttpUrlPolicy;
        $host = str_contains($ip, ':') ? "[{$ip}]" : $ip;

        $decision = $policy->inspect("https://{$host}/v1");

        $this->assertFalse($decision['allowed'], $ip);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function nonPublicIpRanges(): iterable
    {
        yield 'RFC6598 shared space' => ['100.64.0.1'];
        yield 'IPv4 benchmark range' => ['198.18.0.1'];
        yield 'IPv4 documentation TEST-NET-1' => ['192.0.2.1'];
        yield 'IPv4 documentation TEST-NET-2' => ['198.51.100.1'];
        yield 'IPv4 documentation TEST-NET-3' => ['203.0.113.1'];
        yield 'IPv6 unique local' => ['fd00::1'];
        yield 'IPv6 link local' => ['fe80::1'];
        yield 'IPv6 multicast' => ['ff02::1'];
        yield 'IPv6 benchmark range' => ['2001:2::1'];
        yield 'IPv6 documentation range' => ['2001:db8::1'];
        yield 'IPv6 ORCHID range' => ['2001:10::1'];
        yield 'IPv6 current documentation range' => ['3fff::1'];
        yield 'IANA local-use translation prefix' => ['64:ff9b:1::1'];
        yield 'IANA dummy IPv6 prefix' => ['100:0:0:1::1'];
        yield 'IANA segment routing SIDs prefix' => ['5f00::1'];
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function unsafeProviderUrls(): iterable
    {
        yield 'userinfo' => ['https://token@api.openai.com/v1'];
        yield 'password' => ['https://user:token@api.openai.com/v1'];
        yield 'query' => ['https://api.openai.com/v1?api_key=token'];
        yield 'fragment' => ['https://api.openai.com/v1#token'];
    }

    private function pinning(): PublicHttpRequestPinning
    {
        return new PublicHttpRequestPinning(
            PublicHttpUrlPolicy::forProviderHosts(
                ['provider.example'],
                static fn (string $host): array => ['93.184.216.34'],
            ),
            curlResolveAvailable: true,
        );
    }

    /** @param array<string, mixed> $stats */
    private function responseWithStats(array $stats): Response
    {
        $psrResponse = new PsrResponse(200, ['Content-Type' => 'application/json'], '{}');
        $response = new Response($psrResponse);
        $response->transferStats = new TransferStats(
            new PsrRequest('POST', 'https://provider.example/v1/chat/completions'),
            $psrResponse,
            is_numeric($stats['total_time'] ?? null) ? (float) $stats['total_time'] : null,
            null,
            $stats,
        );

        return $response;
    }
}
