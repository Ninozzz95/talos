<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Web\TalosWebFetchException;
use App\Services\Talos\Web\TalosWebFetchService;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\FnStream;
use GuzzleHttp\Psr7\Request as PsrRequest;
use GuzzleHttp\Psr7\Response as PsrResponse;
use GuzzleHttp\Psr7\Utils;
use GuzzleHttp\TransferStats;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response as HttpResponse;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

final class TalosWebFetchServiceTest extends TestCase
{
    public function test_real_gzip_transport_is_decoded_and_bounded_by_both_wire_and_expanded_size(): void
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
        $this->assertIsResource($socket, "Could not reserve a gzip fixture port: {$errorCode} {$errorMessage}");
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $this->assertIsString($address);
        $port = (int) substr(strrchr($address, ':'), 1);
        $this->assertGreaterThan(0, $port);

        $nullDevice = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
        $fixture = dirname(__DIR__).'/fixtures/web-fetch-gzip-router.php';
        $process = proc_open(
            [PHP_BINARY, '-S', "127.0.0.1:{$port}", $fixture],
            [
                0 => ['file', $nullDevice, 'r'],
                1 => ['file', $nullDevice, 'a'],
                2 => ['file', $nullDevice, 'a'],
            ],
            $pipes,
            dirname($fixture),
        );
        $this->assertIsResource($process);

        try {
            $ready = false;
            for ($attempt = 0; $attempt < 50; $attempt++) {
                $connection = @fsockopen('127.0.0.1', $port, $connectError, $connectMessage, 0.05);
                if (is_resource($connection)) {
                    fclose($connection);
                    $ready = true;
                    break;
                }
                usleep(20_000);
            }
            $this->assertTrue($ready, 'The gzip fixture server did not become ready.');

            $policy = PublicHttpUrlPolicy::forTrustedServiceHosts(
                ['127.0.0.1'],
                static fn (string $host): array => ['127.0.0.1'],
            );
            $service = new TalosWebFetchService(
                $policy,
                new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: false),
                static fn (): string => '2026-07-13T12:00:00.000000Z',
            );
            $url = "http://127.0.0.1:{$port}/gzip";
            $rawBody = str_repeat('decompressed evidence ', 128);
            $expected = trim($rawBody);

            $result = $service->fetch($url, maxBytes: 4096);
            $this->assertSame($expected, $result->content);
            $this->assertSame(strlen($rawBody), $result->bytes);

            try {
                $service->fetch($url, maxBytes: 256);
                $this->fail('The expanded gzip body crossed the decoded byte budget.');
            } catch (TalosWebFetchException $exception) {
                $this->assertSame('TALOS_WEB_FETCH_CONTENT_TOO_LARGE', $exception->errorCode);
            }
        } finally {
            proc_terminate($process);
            proc_close($process);
        }
    }

    public function test_fetches_bounded_html_as_untrusted_text_with_source_evidence(): void
    {
        Http::fake(['https://docs.example/page' => Http::response('<html><head><script>bad()</script></head><body><h1>Example</h1><p>Useful content.</p></body></html>', 200, [
            'Content-Type' => 'text/html; charset=utf-8',
        ])]);

        $result = $this->service()->fetch('https://docs.example/page');

        $this->assertSame('https://docs.example/page', $result->url);
        $this->assertSame('text/html', $result->contentType);
        $this->assertSame('Example Useful content.', $result->content);
        $this->assertTrue($result->untrusted);
        $this->assertSame('sha256:'.hash('sha256', '<html><head><script>bad()</script></head><body><h1>Example</h1><p>Useful content.</p></body></html>'), $result->evidenceHash);
        $this->assertSame([], $result->redirectChain);
        $this->assertSame('untrusted_web_fetch', $result->toArray()['provenance']);
    }

    public function test_revalidates_each_manual_redirect_and_records_the_chain(): void
    {
        Http::fakeSequence()
            ->push('', 302, ['Location' => 'https://final.example/article'])
            ->push('Final body', 200, ['Content-Type' => 'text/plain']);

        $result = $this->service()->fetch('https://start.example/article');

        $this->assertSame('https://final.example/article', $result->url);
        $this->assertSame(['https://start.example/article', 'https://final.example/article'], $result->redirectChain);
        Http::assertSentCount(2);
    }

    public function test_blocks_private_or_credential_bearing_urls_before_network_dispatch(): void
    {
        Http::fake();
        foreach (['http://127.0.0.1/private', 'https://user:pass@docs.example/private'] as $url) {
            try {
                $this->service()->fetch($url);
                $this->fail('Unsafe fetch URL was accepted.');
            } catch (TalosWebFetchException $exception) {
                $this->assertSame('TALOS_WEB_FETCH_URL_BLOCKED', $exception->errorCode);
            }
        }
        Http::assertNothingSent();
    }

    public function test_rejects_redirects_to_private_networks_before_following_them(): void
    {
        Http::fakeSequence()->push('', 302, ['Location' => 'http://169.254.169.254/latest/meta-data']);

        try {
            $this->service()->fetch('https://start.example/article');
            $this->fail('Private redirect was followed.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_URL_BLOCKED', $exception->errorCode);
        }
        Http::assertSentCount(1);
    }

    public function test_rejects_declared_and_actual_content_above_the_byte_budget(): void
    {
        Http::fakeSequence()
            ->push('small', 200, ['Content-Type' => 'text/plain', 'Content-Length' => '100'])
            ->push('123456789', 200, ['Content-Type' => 'text/plain']);

        foreach (['https://docs.example/declared', 'https://docs.example/actual'] as $url) {
            try {
                $this->service()->fetch($url, maxBytes: 8);
                $this->fail('Oversized response was accepted.');
            } catch (TalosWebFetchException $exception) {
                $this->assertSame('TALOS_WEB_FETCH_CONTENT_TOO_LARGE', $exception->errorCode);
            }
        }
    }

    public function test_rejects_unsupported_content_types_and_invalid_json(): void
    {
        Http::fakeSequence()
            ->push('binary', 200, ['Content-Type' => 'application/octet-stream'])
            ->push('{bad json', 200, ['Content-Type' => 'application/json']);

        foreach ([
            ['https://docs.example/binary', 'TALOS_WEB_FETCH_CONTENT_TYPE'],
            ['https://docs.example/json', 'TALOS_WEB_FETCH_CONTENT_INVALID'],
        ] as [$url, $code]) {
            try {
                $this->service()->fetch($url);
                $this->fail('Malformed fetch response was accepted.');
            } catch (TalosWebFetchException $exception) {
                $this->assertSame($code, $exception->errorCode);
            }
        }
    }

    public function test_rejects_ambiguous_http_body_framing(): void
    {
        Http::fake(['https://docs.example/framing' => Http::response('body', 200, [
            'Content-Type' => 'text/plain',
            'Content-Length' => '4',
            'Transfer-Encoding' => 'chunked',
        ])]);

        try {
            $this->service()->fetch('https://docs.example/framing');
            $this->fail('Ambiguous response framing was accepted.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_CONTENT_INVALID', $exception->errorCode);
        }
    }

    public function test_reports_network_unavailability_without_fabricating_content(): void
    {
        Http::fake(fn () => throw new ConnectionException('offline'));

        try {
            $this->service()->fetch('https://docs.example/offline');
            $this->fail('Unavailable response was reported as fetched.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_UNAVAILABLE', $exception->errorCode);
            $this->assertSame('Web fetch endpoint is unavailable.', $exception->getMessage());
        }
    }

    public function test_rejects_redirect_loops_at_the_configured_limit(): void
    {
        Http::fake(fn () => Http::response('', 302, ['Location' => '/again']));

        try {
            $this->service()->fetch('https://docs.example/again', maxRedirects: 2);
            $this->fail('Redirect loop exceeded its bound.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_REDIRECT_LIMIT', $exception->errorCode);
        }
        Http::assertSentCount(3);
    }

    public function test_redirects_share_one_wall_clock_timeout_budget(): void
    {
        $timeouts = [];
        $calls = 0;
        Http::fake(function ($request, array $options) use (&$timeouts, &$calls) {
            $timeouts[] = $options['timeout'] ?? null;
            $calls++;
            if ($calls === 1) {
                usleep(20_000);

                return Http::response('', 302, ['Location' => 'https://final.example/article']);
            }

            return Http::response('done', 200, ['Content-Type' => 'text/plain']);
        });

        $this->service()->fetch('https://start.example/article', timeoutMs: 100);

        $this->assertCount(2, $timeouts);
        $this->assertGreaterThan(0, $timeouts[1]);
        $this->assertLessThan($timeouts[0], $timeouts[1]);
    }

    public function test_deadline_expiry_during_policy_or_pinning_prevents_network_dispatch(): void
    {
        Http::fake();
        $now = 100.0;
        $policy = new PublicHttpUrlPolicy(
            resolver: static function (string $host) use (&$now): array {
                $now = 100.2;

                return ['93.184.216.34'];
            },
        );

        try {
            (new TalosWebFetchService(
                $policy,
                new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: false),
                static fn (): string => '2026-07-12T22:00:00.000000Z',
                static function () use (&$now): float {
                    return $now;
                },
            ))->fetch('https://docs.example/policy-timeout', timeoutMs: 100);
            $this->fail('An expired policy or pinning deadline was ignored.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_TIMEOUT', $exception->errorCode);
            $this->assertStringNotContainsString('internals', $exception->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_deadline_expiry_during_bounded_stream_read_is_controlled(): void
    {
        $now = 100.0;
        $stream = Utils::streamFor('stream body');
        $stream = FnStream::decorate($stream, [
            'read' => static function (int $length) use (&$now, $stream): string {
                $now = 100.2;

                return $stream->read($length);
            },
        ]);
        Http::fake(['https://docs.example/stream-timeout' => static fn (): PromiseInterface => Create::promiseFor(
            new PsrResponse(200, ['Content-Type' => 'text/plain'], $stream),
        )]);

        try {
            $this->service(monotonicClock: static function () use (&$now): float {
                return $now;
            })
                ->fetch('https://docs.example/stream-timeout', timeoutMs: 100);
            $this->fail('A stream read that consumed the deadline was accepted.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_TIMEOUT', $exception->errorCode);
            $this->assertStringNotContainsString('stream internals', $exception->getMessage());
        }
    }

    public function test_unexpected_transport_exception_is_mapped_without_leaking_its_message(): void
    {
        Http::fake(static fn (): never => throw new RuntimeException('transport internals'));

        try {
            $this->service()->fetch('https://docs.example/transport-failure');
            $this->fail('An unexpected transport exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_UNAVAILABLE', $exception->errorCode);
            $this->assertSame('Web fetch endpoint is unavailable.', $exception->getMessage());
            $this->assertStringNotContainsString('transport internals', $exception->getMessage());
        }
    }

    public function test_resolver_exception_is_mapped_to_url_blocked_without_leaking_its_message(): void
    {
        $policy = new PublicHttpUrlPolicy(
            resolver: static fn (string $host): array => throw new RuntimeException('resolver internals'),
        );

        try {
            (new TalosWebFetchService(
                $policy,
                new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: false),
                static fn (): string => '2026-07-12T22:00:00.000000Z',
            ))->fetch('https://docs.example/resolver-failure');
            $this->fail('An unexpected resolver exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_URL_BLOCKED', $exception->errorCode);
            $this->assertSame('Web fetch URL was blocked by policy.', $exception->getMessage());
            $this->assertStringNotContainsString('resolver internals', $exception->getMessage());
        }
    }

    public function test_pinning_exception_is_mapped_without_leaking_its_message(): void
    {
        $inspections = 0;
        $policy = new PublicHttpUrlPolicy(
            resolver: static function (string $host) use (&$inspections): array {
                $inspections++;
                if ($inspections > 1) {
                    throw new RuntimeException('pinning internals');
                }

                return ['93.184.216.34'];
            },
        );

        try {
            (new TalosWebFetchService(
                $policy,
                new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: false),
                static fn (): string => '2026-07-12T22:00:00.000000Z',
            ))->fetch('https://docs.example/pinning-failure');
            $this->fail('An unexpected pinning exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_PINNING_UNAVAILABLE', $exception->errorCode);
            $this->assertSame('Web fetch connection could not be pinned safely.', $exception->getMessage());
            $this->assertStringNotContainsString('pinning internals', $exception->getMessage());
        }
    }

    public function test_monotonic_clock_exception_is_mapped_to_timeout_without_leaking_its_message(): void
    {
        try {
            $this->service(monotonicClock: static fn (): float => throw new RuntimeException('clock internals'))
                ->fetch('https://docs.example/clock-failure');
            $this->fail('An unexpected clock exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_TIMEOUT', $exception->errorCode);
            $this->assertSame('Web fetch wall-clock budget was exhausted.', $exception->getMessage());
            $this->assertStringNotContainsString('clock internals', $exception->getMessage());
        }
    }

    public function test_result_clock_exception_is_mapped_to_timeout_without_leaking_its_message(): void
    {
        Http::fake(['https://docs.example/result-clock-failure' => Http::response('body', 200, [
            'Content-Type' => 'text/plain',
        ])]);

        try {
            $this->service(
                clock: static fn (): string => throw new RuntimeException('result clock internals'),
            )->fetch('https://docs.example/result-clock-failure');
            $this->fail('An unexpected result clock exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_TIMEOUT', $exception->errorCode);
            $this->assertSame('Web fetch wall-clock budget was exhausted.', $exception->getMessage());
            $this->assertStringNotContainsString('result clock internals', $exception->getMessage());
        }
    }

    public function test_stream_exception_is_mapped_to_invalid_content_without_leaking_its_message(): void
    {
        $stream = FnStream::decorate(Utils::streamFor('body'), [
            'read' => static fn (int $length): string => throw new RuntimeException('stream internals'),
        ]);
        Http::fake(['https://docs.example/stream-failure' => static fn (): PromiseInterface => Create::promiseFor(
            new PsrResponse(200, ['Content-Type' => 'text/plain'], $stream),
        )]);

        try {
            $this->service()->fetch('https://docs.example/stream-failure');
            $this->fail('An unexpected stream exception escaped the fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_CONTENT_INVALID', $exception->errorCode);
            $this->assertSame('Web fetch content is invalid.', $exception->getMessage());
            $this->assertStringNotContainsString('stream internals', $exception->getMessage());
        }
    }

    public function test_missing_or_mismatched_primary_ip_evidence_is_rejected(): void
    {
        Http::fake(['https://docs.example/missing-evidence' => Http::response('missing evidence', 200, [
            'Content-Type' => 'text/plain',
        ])]);

        try {
            $this->service(requirePrimaryIpEvidence: true)->fetch('https://docs.example/missing-evidence');
            $this->fail('A response without primary-IP evidence was accepted.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_PRIMARY_IP_MISMATCH', $exception->errorCode);
        }

        $psrResponse = new PsrResponse(200, ['Content-Type' => 'text/plain'], 'mismatched evidence');
        $response = new HttpResponse($psrResponse);
        $response->transferStats = new TransferStats(
            new PsrRequest('GET', 'https://docs.example/mismatched-evidence'),
            $psrResponse,
            null,
            null,
            ['primary_ip' => '198.51.100.2'],
        );
        $policy = new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['93.184.216.34']);
        $pinning = new PublicHttpRequestPinning($policy, curlResolveAvailable: true);

        $this->assertFalse($pinning->connectedToPinnedIp($response, $pinning->pin('https://docs.example/mismatched-evidence')));
    }

    private function service(?callable $monotonicClock = null, bool $requirePrimaryIpEvidence = false, ?callable $clock = null): TalosWebFetchService
    {
        $policy = new PublicHttpUrlPolicy(resolver: static fn (string $host): array => match ($host) {
            'docs.example', 'start.example', 'final.example' => ['93.184.216.34'],
            default => [],
        });

        return new TalosWebFetchService(
            $policy,
            new PublicHttpRequestPinning($policy, curlResolveAvailable: true, requirePrimaryIpEvidence: $requirePrimaryIpEvidence),
            $clock ?? static fn (): string => '2026-07-12T22:00:00.000000Z',
            $monotonicClock,
        );
    }
}
