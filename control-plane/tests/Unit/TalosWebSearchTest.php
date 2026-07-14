<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Web\SearxngWebSearchProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

final class TalosWebSearchTest extends TestCase
{
    public function test_search_preserves_path_and_query_semantics_while_using_a_separate_deduplication_key(): void
    {
        Http::fake(Http::response([
            'results' => [
                ['title' => 'Trailing slash', 'url' => 'https://Example.com:443/item/?b=2&a=1#details', 'content' => 'First'],
                ['title' => 'No trailing slash', 'url' => 'https://example.com/item?b=2&a=1', 'content' => 'Second'],
                ['title' => 'Different query order', 'url' => 'https://example.com/item/?a=1&b=2', 'content' => 'Third'],
                ['title' => 'Fragment duplicate', 'url' => 'https://example.com/item/?b=2&a=1#other', 'content' => 'Duplicate'],
            ],
        ]));

        $response = $this->provider()->search('semantic urls');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertSame([
            'https://example.com/item/?b=2&a=1#details',
            'https://example.com/item?b=2&a=1',
            'https://example.com/item/?a=1&b=2',
        ], array_map(static fn ($result): string => $result->url, $response->results));
    }

    public function test_searxng_search_uses_official_json_parameters_and_normalizes_untrusted_results(): void
    {
        $seenOptions = null;
        Http::fake(function (Request $request, array $options) use (&$seenOptions) {
            $seenOptions = $options;

            return Http::response([
                'results' => [
                    [
                        'title' => 'First result',
                        'url' => 'https://Example.com:443/article/#section',
                        'content' => 'A bounded result snippet.',
                        'engine' => 'google',
                        'publishedDate' => '2026-07-12T10:00:00+00:00',
                    ],
                    [
                        'title' => 'Duplicate result',
                        'url' => 'https://example.com/article/#other',
                        'content' => 'This URL must be deduplicated.',
                        'engine' => 'bing',
                    ],
                    [
                        'title' => 'Private result',
                        'url' => 'http://127.0.0.1/private',
                        'content' => 'This result must not cross the boundary.',
                        'engine' => 'unsafe',
                    ],
                    [
                        'title' => 'Invalid result',
                        'url' => 'javascript:alert(1)',
                        'content' => 'This result is not an HTTP URL.',
                        'engine' => 'unsafe',
                    ],
                    [
                        'title' => 'Fallback date result',
                        'url' => 'https://example.com/another',
                        'content' => 'An invalid publication date uses retrieval time.',
                        'engine' => 'duckduckgo',
                        'publishedDate' => 'not-a-date',
                    ],
                ],
            ]);
        });

        $provider = $this->provider();

        $response = $provider->search('php security', [
            'language' => 'en',
            'pageno' => 2,
            'time_range' => 'month',
            'safesearch' => 2,
        ]);

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertSame('untrusted_web_search', $response->provenance);
        $this->assertCount(2, $response->results);

        $result = $response->results[0];
        $this->assertSame('First result', $result->title);
        $this->assertSame('https://example.com/article/#section', $result->url);
        $this->assertSame('A bounded result snippet.', $result->snippet);
        $this->assertSame('google', $result->source);
        $this->assertSame(1, $result->rank);
        $this->assertSame('2026-07-12T10:00:00+00:00', $result->timestamp);
        $this->assertMatchesRegularExpression('/\Asha256:[a-f0-9]{64}\z/', $result->evidenceHash);
        $this->assertSame('untrusted', $result->provenance);
        $this->assertTrue($result->untrusted);
        $this->assertSame('2026-07-13T12:00:00+00:00', $response->results[1]->timestamp);
        $this->assertTrue($seenOptions['stream'] ?? false);
        $this->assertSame(false, $seenOptions['allow_redirects'] ?? null);
        $this->assertNotEmpty($seenOptions['curl'][CURLOPT_RESOLVE] ?? []);

        Http::assertSent(function (Request $request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return $request->method() === 'GET'
                && parse_url($request->url(), PHP_URL_PATH) === '/search'
                && $query === [
                    'q' => 'php security',
                    'format' => 'json',
                    'language' => 'en',
                    'pageno' => '2',
                    'time_range' => 'month',
                    'safesearch' => '2',
                ];
        });
    }

    public function test_malformed_provider_payload_is_an_honest_unavailable_result(): void
    {
        Http::fake(['searx.example/search*' => Http::response(['results' => 'not-a-list'])]);

        $response = $this->provider()->search('malformed');

        $this->assertFalse($response->available);
        $this->assertSame([], $response->results);
        $this->assertSame('malformed_response', $response->reason);
        $this->assertSame('untrusted_web_search', $response->provenance);
    }

    public function test_non_json_provider_content_is_rejected_before_parsing(): void
    {
        Http::fake(['searx.example/search*' => Http::response('<html>not json</html>', 200, ['Content-Type' => 'text/html'])]);

        $response = $this->provider()->search('wrong content type');

        $this->assertFalse($response->available);
        $this->assertSame('unsupported_content_type', $response->reason);
    }

    public function test_undocumented_time_range_is_rejected_before_provider_dispatch(): void
    {
        Http::fake();

        $response = $this->provider()->search('recent', ['time_range' => 'week']);

        $this->assertFalse($response->available);
        $this->assertSame('invalid_options', $response->reason);
        Http::assertNothingSent();
    }

    public function test_unknown_options_are_rejected_before_provider_dispatch(): void
    {
        Http::fake();

        $response = $this->provider()->search('unexpected option', ['secret' => 'value']);

        $this->assertFalse($response->available);
        $this->assertSame('invalid_options', $response->reason);
        Http::assertNothingSent();
    }

    public function test_query_and_response_size_limits_fail_closed_before_normalization(): void
    {
        Http::fake(['searx.example/search*' => Http::response(json_encode([
            'results' => [['title' => str_repeat('x', 3 * 1024 * 1024)]],
        ], JSON_THROW_ON_ERROR), 200, ['Content-Type' => 'application/json'])]);

        $queryResponse = $this->provider()->search(str_repeat('q', 513));

        $this->assertFalse($queryResponse->available);
        $this->assertSame('query_too_large', $queryResponse->reason);
        Http::assertNothingSent();

        $bodyResponse = $this->provider()->search('bounded response');

        $this->assertFalse($bodyResponse->available);
        $this->assertSame('response_too_large', $bodyResponse->reason);
    }

    public function test_private_or_unallowlisted_endpoint_is_rejected_without_an_http_request(): void
    {
        Http::fake();

        $provider = new SearxngWebSearchProvider(
            'http://127.0.0.1:8080',
            PublicHttpUrlPolicy::forProviderHosts(['searx.example'], static fn (string $host): array => ['93.184.216.34']),
            new PublicHttpRequestPinning(
                PublicHttpUrlPolicy::forProviderHosts(['searx.example'], static fn (string $host): array => ['93.184.216.34']),
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
        );

        $response = $provider->search('private');

        $this->assertFalse($response->available);
        $this->assertSame('endpoint_blocked', $response->reason);
        Http::assertNothingSent();
    }

    public function test_timeout_or_connection_failure_is_reported_as_unavailable(): void
    {
        Http::fake(['searx.example/search*' => Http::failedConnection()]);

        $response = $this->provider()->search('timeout');

        $this->assertFalse($response->available);
        $this->assertSame('provider_unavailable', $response->reason);
        $this->assertSame([], $response->results);
    }

    public function test_unexpected_transport_failure_is_reported_without_leaking_an_exception(): void
    {
        Http::fake(static fn () => throw new RuntimeException('transport internals'));

        $response = $this->provider()->search('transport failure');

        $this->assertFalse($response->available);
        $this->assertSame('provider_unavailable', $response->reason);
        $this->assertSame([], $response->results);
    }

    public function test_explicit_internal_searxng_service_is_pinned_while_private_result_urls_remain_blocked(): void
    {
        Http::fake(['searxng:8080/search*' => Http::response([
            'results' => [
                [
                    'title' => 'Public result',
                    'url' => 'https://example.com/public',
                    'content' => 'Public evidence.',
                ],
                [
                    'title' => 'Private result',
                    'url' => 'http://169.254.169.254/latest/meta-data',
                    'content' => 'Must remain blocked.',
                ],
            ],
        ])]);
        $endpointPolicy = PublicHttpUrlPolicy::forTrustedServiceHosts(
            ['searxng'],
            static fn (string $host): array => ['172.24.0.12'],
        );
        $provider = new SearxngWebSearchProvider(
            'http://searxng:8080',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            new PublicHttpUrlPolicy(resolver: static fn (string $host): array => $host === 'example.com'
                ? ['93.184.216.34']
                : ['169.254.169.254']),
            static fn (): string => '2026-07-13T12:00:00+00:00',
        );

        $response = $provider->search('self hosted');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertCount(1, $response->results);
        $this->assertSame('https://example.com/public', $response->results[0]->url);
    }

    public function test_end_to_end_deadline_can_expire_after_pinning_before_network_dispatch(): void
    {
        Http::fake();
        $ticks = [100.0, 102.0];
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );
        $provider = new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['93.184.216.34']),
            static fn (): string => '2026-07-13T12:00:00+00:00',
            timeoutSeconds: 1,
            monotonicClock: static function () use (&$ticks): float {
                return array_shift($ticks) ?? 102.0;
            },
        );

        $response = $provider->search('deadline');

        $this->assertFalse($response->available);
        $this->assertSame('timeout', $response->reason);
        Http::assertNothingSent();
    }

    public function test_deadline_exhausted_while_reading_the_response_is_reported_as_timeout(): void
    {
        Http::fake(['searx.example/search*' => Http::response(['results' => []])]);
        $ticks = [100.0, 100.0, 100.0, 100.0, 100.0, 102.0, 102.0];
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );
        $provider = new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['93.184.216.34']),
            static fn (): string => '2026-07-13T12:00:00+00:00',
            timeoutSeconds: 1,
            monotonicClock: static function () use (&$ticks): float {
                return array_shift($ticks) ?? 102.0;
            },
        );

        $response = $provider->search('stream deadline');

        $this->assertFalse($response->available);
        $this->assertSame('timeout', $response->reason);
    }

    public function test_clock_failure_is_mapped_to_provider_unavailable_without_leaking_details(): void
    {
        Http::fake();
        $calls = 0;
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );
        $provider = new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            monotonicClock: static function () use (&$calls): float {
                if ($calls++ > 0) {
                    throw new RuntimeException('clock internals');
                }

                return 100.0;
            },
        );

        $response = $provider->search('clock failure');

        $this->assertFalse($response->available);
        $this->assertSame('provider_unavailable', $response->reason);
        Http::assertNothingSent();
    }

    public function test_duplicate_results_are_deduplicated_before_dns_resolution(): void
    {
        Http::fake(['searx.example/search*' => Http::response([
            'results' => [
                ['title' => 'First', 'url' => 'https://duplicate.example/article#one', 'content' => 'one'],
                ['title' => 'Duplicate', 'url' => 'https://duplicate.example/article#two', 'content' => 'two'],
            ],
        ])]);
        $resolutions = 0;

        $response = $this->providerWithResultResolver(static function (string $host) use (&$resolutions): array {
            $resolutions++;

            return ['93.184.216.34'];
        })->search('duplicates');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertCount(1, $response->results);
        $this->assertSame(1, $resolutions);
    }

    public function test_raw_result_processing_is_bounded_before_dns_work(): void
    {
        Http::fake(['searx.example/search*' => Http::response([
            'results' => array_map(static fn (int $index): array => [
                'title' => 'Blocked '.$index,
                'url' => 'https://blocked-'.$index.'.example/result',
                'content' => 'blocked',
            ], range(1, 200)),
        ])]);
        $resolutions = 0;

        $response = $this->providerWithResultResolver(static function (string $host) use (&$resolutions): array {
            $resolutions++;

            return ['127.0.0.1'];
        })->search('bounded dns work');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertSame([], $response->results);
        $this->assertSame(16, $resolutions);
    }

    public function test_result_policy_failure_is_an_honest_unavailable_response(): void
    {
        Http::fake(['searx.example/search*' => Http::response([
            'results' => [[
                'title' => 'Result',
                'url' => 'https://result.example/article',
                'content' => 'content',
            ]],
        ])]);

        $response = $this->providerWithResultResolver(
            static fn (string $host): array => throw new RuntimeException('resolver internals'),
        )->search('resolver failure');

        $this->assertFalse($response->available);
        $this->assertSame('result_policy_unavailable', $response->reason);
        $this->assertSame([], $response->results);
    }

    public function test_missing_primary_ip_evidence_is_rejected_when_production_verification_is_enabled(): void
    {
        Http::fake(['searx.example/search*' => Http::response(['results' => []])]);
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );
        $provider = new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning($endpointPolicy, curlResolveAvailable: true),
        );

        $response = $provider->search('primary ip');

        $this->assertFalse($response->available);
        $this->assertSame('connected_ip_mismatch', $response->reason);
    }

    private function provider(): SearxngWebSearchProvider
    {
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );

        return new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            new PublicHttpUrlPolicy(
                resolver: static fn (string $host): array => ['93.184.216.34'],
            ),
            static fn (): string => '2026-07-13T12:00:00+00:00',
        );
    }

    private function providerWithResultResolver(\Closure $resolver): SearxngWebSearchProvider
    {
        $endpointPolicy = PublicHttpUrlPolicy::forProviderHosts(
            ['searx.example'],
            static fn (string $host): array => ['93.184.216.34'],
        );

        return new SearxngWebSearchProvider(
            'https://searx.example',
            $endpointPolicy,
            new PublicHttpRequestPinning(
                $endpointPolicy,
                curlResolveAvailable: true,
                requirePrimaryIpEvidence: false,
            ),
            new PublicHttpUrlPolicy(resolver: $resolver),
            static fn (): string => '2026-07-13T12:00:00+00:00',
        );
    }
}
