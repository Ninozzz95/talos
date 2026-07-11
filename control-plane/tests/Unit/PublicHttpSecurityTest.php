<?php

declare(strict_types=1);

namespace Tests\Unit;

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
