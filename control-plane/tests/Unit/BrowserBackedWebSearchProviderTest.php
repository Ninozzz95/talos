<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserToolResult;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserWorkerHandshake;
use App\Services\Talos\Web\BrowserBackedWebSearchProvider;
use Tests\TestCase;

final class BrowserBackedWebSearchProviderTest extends TestCase
{
    public function test_browser_search_preserves_path_and_query_semantics_while_deduplicating_fragments_only(): void
    {
        $client = new RecordingBrowserSessionClient;
        $client->snapshotResponse = [
            'nodes' => [
                ['ref' => 'r1', 'role' => 'link', 'name' => 'Trailing slash', 'href' => 'https://Example.com:443/item/?b=2&a=1#details'],
                ['ref' => 'r2', 'role' => 'link', 'name' => 'No trailing slash', 'href' => 'https://example.com/item?b=2&a=1'],
                ['ref' => 'r3', 'role' => 'link', 'name' => 'Different query order', 'href' => 'https://example.com/item/?a=1&b=2'],
                ['ref' => 'r4', 'role' => 'link', 'name' => 'Fragment duplicate', 'href' => 'https://example.com/item/?b=2&a=1#other'],
            ],
        ];

        $response = $this->provider($client)->search('semantic urls');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertSame([
            'https://example.com/item/?b=2&a=1#details',
            'https://example.com/item?b=2&a=1',
            'https://example.com/item/?a=1&b=2',
        ], array_map(static fn ($result): string => $result->url, $response->results));
    }

    public function test_disabled_provider_declares_external_privacy_effect_and_does_not_create_a_browser_session(): void
    {
        $client = new RecordingBrowserSessionClient;
        $provider = $this->provider($client, enabled: false);

        $response = $provider->search('php security');

        $this->assertFalse($response->available);
        $this->assertSame('provider_disabled', $response->reason);
        $this->assertSame('https://search.example/search', $provider->searchOrigin);
        $this->assertFalse($provider->enabled);
        $this->assertSame('query_and_result_urls_leave_the_control_plane_via_read_only_chromium', $provider->privacyEffect());
        $this->assertSame([], $client->calls);
    }

    public function test_read_only_search_client_rejects_file_staging(): void
    {
        $client = new RecordingBrowserSessionClient;

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Browser search must not stage upload files.');

        $client->stageFile('user:7', 'worker-1', 'stg_11111111-1111-4111-8111-111111111111', []);
    }

    public function test_read_only_search_client_rejects_staged_file_discard(): void
    {
        $client = new RecordingBrowserSessionClient;

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Browser search must not discard staged upload files.');

        $client->discardStagedFile('user:7', 'worker-1', 'stg_11111111-1111-4111-8111-111111111111');
    }

    public function test_search_uses_an_owner_scoped_read_only_browser_and_normalizes_safe_link_nodes(): void
    {
        $client = new RecordingBrowserSessionClient;
        $client->snapshotResponse = [
            'format' => 'accessibility_refs_v1',
            'snapshotId' => 'snap-1',
            'nodes' => [
                ['ref' => 'r1', 'role' => 'heading', 'name' => 'Search results', 'visible' => true],
                ['ref' => 'r2', 'role' => 'link', 'name' => 'First result', 'href' => 'https://Example.com:443/article/#section', 'visible' => true],
                ['ref' => 'r3', 'role' => 'link', 'name' => 'Duplicate result', 'href' => 'https://example.com/article/#other', 'visible' => true],
                ['ref' => 'r4', 'role' => 'link', 'name' => 'Private result', 'href' => 'http://127.0.0.1/private', 'visible' => true],
                ['ref' => 'r5', 'role' => 'link', 'name' => 'JavaScript result', 'href' => 'javascript:alert(1)', 'visible' => true],
                ['ref' => 'r6', 'role' => 'link', 'name' => 'Missing href', 'visible' => true],
                ...array_map(static fn (int $rank): array => [
                    'ref' => 'r'.($rank + 6),
                    'role' => 'link',
                    'name' => 'Result '.$rank,
                    'href' => 'https://example.com/result/'.$rank,
                    'visible' => true,
                ], range(1, 12)),
            ],
            'textDigest' => 'Search results',
            'url' => 'https://search.example/search?q=php%20security',
            'title' => 'Search',
        ];

        $provider = $this->provider($client);
        $response = $provider->search(' php security ');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertSame('untrusted_web_search', $response->provenance);
        $this->assertCount(10, $response->results);
        $this->assertSame('https://example.com/article/#section', $response->results[0]->url);
        $this->assertSame('First result', $response->results[0]->title);
        $this->assertSame('', $response->results[0]->snippet);
        $this->assertSame('browser_backed', $response->results[0]->source);
        $this->assertSame(1, $response->results[0]->rank);
        $this->assertSame('2026-07-13T12:00:00+00:00', $response->results[0]->timestamp);
        $this->assertMatchesRegularExpression('/\Asha256:[a-f0-9]{64}\z/', $response->results[0]->evidenceHash);
        $this->assertSame('untrusted', $response->results[0]->provenance);
        $this->assertTrue($response->results[0]->untrusted);
        $this->assertSame([
            ['method' => 'create', 'ownerRef' => 'user:7', 'width' => 1280, 'height' => 800],
            ['method' => 'navigate', 'ownerRef' => 'user:7', 'workerSessionId' => 'worker-1', 'url' => 'https://search.example/search?q=php%20security'],
            ['method' => 'snapshot', 'ownerRef' => 'user:7', 'workerSessionId' => 'worker-1'],
            ['method' => 'close', 'ownerRef' => 'user:7', 'workerSessionId' => 'worker-1'],
        ], $client->calls);
    }

    public function test_browser_failure_returns_an_honest_unavailable_response_and_closes_the_ephemeral_session(): void
    {
        $client = new RecordingBrowserSessionClient;
        $client->failureMethod = 'navigate';
        $provider = $this->provider($client);

        $response = $provider->search('failure');

        $this->assertFalse($response->available);
        $this->assertSame('browser_unavailable', $response->reason);
        $this->assertSame('close', $client->calls[array_key_last($client->calls)]['method']);
    }

    public function test_search_validates_and_forwards_supported_options_to_the_browser_url(): void
    {
        $client = new RecordingBrowserSessionClient;
        $client->snapshotResponse = ['nodes' => []];
        $provider = $this->provider($client);

        $response = $provider->search('php security', [
            'language' => 'it-IT',
            'pageno' => 3,
            'time_range' => 'month',
            'safesearch' => 2,
        ]);

        $this->assertTrue($response->available, (string) $response->reason);
        $navigate = $client->calls[1];
        $this->assertSame(
            'https://search.example/search?q=php%20security&language=it-IT&pageno=3&time_range=month&safesearch=2',
            $navigate['url'],
        );
    }

    public function test_unknown_or_invalid_options_are_rejected_before_browser_use(): void
    {
        foreach ([
            ['unknown' => true],
            ['language' => ''],
            ['language' => str_repeat('a', 33)],
            ['language' => 'it IT'],
            ['pageno' => '2'],
            ['pageno' => 0],
            ['pageno' => 101],
            ['time_range' => 'week'],
            ['safesearch' => '1'],
            ['safesearch' => -1],
            ['safesearch' => 3],
        ] as $options) {
            $client = new RecordingBrowserSessionClient;
            $response = $this->provider($client)->search('php security', $options);

            $this->assertFalse($response->available);
            $this->assertSame('invalid_options', $response->reason);
            $this->assertSame([], $client->calls);
        }
    }

    public function test_browser_search_does_not_resolve_hosts_in_php_before_browser_dispatch(): void
    {
        $resolvedHosts = [];
        $client = new RecordingBrowserSessionClient;
        $client->snapshotResponse = ['nodes' => [[
            'role' => 'link',
            'name' => 'Result',
            'href' => 'https://never-resolves.example/article',
        ]]];
        $policy = new PublicHttpUrlPolicy(resolver: static function (string $host) use (&$resolvedHosts): array {
            $resolvedHosts[] = $host;

            return [];
        });
        $provider = new BrowserBackedWebSearchProvider(
            client: $client,
            publicUrlPolicy: $policy,
            ownerRef: 'user:7',
            searchOrigin: 'https://search.example/search',
            enabled: true,
            clock: static fn (): string => '2026-07-13T12:00:00+00:00',
        );

        $response = $provider->search('browser authority');

        $this->assertTrue($response->available, (string) $response->reason);
        $this->assertCount(1, $response->results);
        $this->assertSame([], $resolvedHosts);
    }

    public function test_aggregate_monotonic_deadline_propagates_decreasing_timeouts_and_returns_browser_timeout(): void
    {
        $now = 10.0;
        $client = new RecordingBrowserSessionClient;
        $client->snapshotResponse = ['nodes' => []];
        $client->afterCall = static function (string $method) use (&$now): void {
            $now += match ($method) {
                'create', 'navigate' => 0.25,
                'snapshot' => 0.51,
                default => 0.0,
            };
        };
        $provider = $this->providerWithDeadline($client, $now, timeoutMilliseconds: 1000);

        $response = $provider->search('deadline');

        $this->assertFalse($response->available);
        $this->assertSame('browser_timeout', $response->reason);
        $this->assertSame(['create', 'navigate', 'snapshot', 'close'], array_column($client->calls, 'method'));
        $this->assertLessThanOrEqual(1000, $client->timeouts['create'][0]);
        $this->assertGreaterThanOrEqual(999, $client->timeouts['create'][0]);
        $this->assertLessThanOrEqual(750, $client->timeouts['navigate'][0]);
        $this->assertGreaterThanOrEqual(749, $client->timeouts['navigate'][0]);
        $this->assertLessThanOrEqual(500, $client->timeouts['snapshot'][0]);
        $this->assertGreaterThanOrEqual(499, $client->timeouts['snapshot'][0]);
        $this->assertSame(100, $client->timeouts['close'][0]);
    }

    public function test_cleanup_is_best_effort_with_only_the_remaining_deadline_budget(): void
    {
        $now = 20.0;
        $client = new RecordingBrowserSessionClient;
        $client->failureMethod = 'navigate';
        $client->afterCall = static function (string $method) use (&$now): void {
            if ($method === 'create') {
                $now += 0.90;
            }
        };
        $provider = $this->providerWithDeadline($client, $now, timeoutMilliseconds: 1000);

        $response = $provider->search('cleanup');

        $this->assertFalse($response->available);
        $this->assertSame('browser_unavailable', $response->reason);
        $this->assertSame('close', $client->calls[array_key_last($client->calls)]['method']);
        $this->assertLessThanOrEqual(100, $client->timeouts['close'][0]);
        $this->assertGreaterThanOrEqual(99, $client->timeouts['close'][0]);
    }

    public function test_cleanup_uses_a_separate_bounded_allowance_after_the_main_deadline_expires(): void
    {
        $now = 20.0;
        $client = new RecordingBrowserSessionClient;
        $client->afterCall = static function (string $method) use (&$now): void {
            if ($method === 'create') {
                $now += 1.1;
            }
        };
        $provider = $this->providerWithDeadline($client, $now, timeoutMilliseconds: 1000);

        $response = $provider->search('cleanup after deadline');

        $this->assertFalse($response->available);
        $this->assertSame('browser_timeout', $response->reason);
        $this->assertSame('close', $client->calls[array_key_last($client->calls)]['method']);
        $this->assertSame(100, $client->timeouts['close'][0]);
    }

    public function test_search_uses_a_short_ttl_for_ephemeral_sessions(): void
    {
        $client = new RecordingBrowserSessionClient;
        $provider = $this->provider($client);

        $provider->search('short ttl');

        $this->assertCount(1, $client->createTtls);
        $this->assertGreaterThanOrEqual(1, $client->createTtls[0]);
        $this->assertLessThanOrEqual(60, $client->createTtls[0]);
    }

    public function test_missing_worker_session_id_is_reported_as_an_invalid_session_without_follow_up_calls(): void
    {
        $client = new RecordingBrowserSessionClient;
        $client->createResponse = ['mode' => 'read_only', 'status' => 'ready'];
        $provider = $this->provider($client);

        $response = $provider->search('invalid session');

        $this->assertFalse($response->available);
        $this->assertSame('browser_session_invalid', $response->reason);
        $this->assertSame(['create'], array_column($client->calls, 'method'));
    }

    public function test_blocked_configured_origin_is_rejected_before_browser_use(): void
    {
        $client = new RecordingBrowserSessionClient;
        $provider = new BrowserBackedWebSearchProvider(
            client: $client,
            publicUrlPolicy: new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['127.0.0.1']),
            ownerRef: 'user:7',
            searchOrigin: 'http://127.0.0.1:8080/search',
            enabled: true,
            clock: static fn (): string => '2026-07-13T12:00:00+00:00',
        );

        $response = $provider->search('private');

        $this->assertFalse($response->available);
        $this->assertSame('search_origin_blocked', $response->reason);
        $this->assertSame([], $client->calls);
    }

    private function provider(RecordingBrowserSessionClient $client, bool $enabled = true): BrowserBackedWebSearchProvider
    {
        return new BrowserBackedWebSearchProvider(
            client: $client,
            publicUrlPolicy: new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['93.184.216.34']),
            ownerRef: 'user:7',
            searchOrigin: 'https://search.example/search',
            enabled: $enabled,
            clock: static fn (): string => '2026-07-13T12:00:00+00:00',
        );
    }

    private function providerWithDeadline(RecordingBrowserSessionClient $client, float &$now, int $timeoutMilliseconds): BrowserBackedWebSearchProvider
    {
        return new BrowserBackedWebSearchProvider(
            client: $client,
            publicUrlPolicy: new PublicHttpUrlPolicy(resolver: static fn (string $host): array => ['93.184.216.34']),
            ownerRef: 'user:7',
            searchOrigin: 'https://search.example/search',
            enabled: true,
            clock: static fn (): string => '2026-07-13T12:00:00+00:00',
            timeoutMilliseconds: $timeoutMilliseconds,
            monotonicClock: static function () use (&$now): float {
                return $now;
            },
        );
    }
}

final class RecordingBrowserSessionClient implements BrowserSessionClient
{
    /** @var list<array<string, mixed>> */
    public array $calls = [];

    /** @var array<string, mixed> */
    public array $snapshotResponse = [];

    public ?string $failureMethod = null;

    /** @var array<string, mixed>|null */
    public ?array $createResponse = null;

    /** @var (callable(string): void)|null */
    public $afterCall = null;

    /** @var array<string, list<int>> */
    public array $timeouts = [];

    /** @var list<int> */
    public array $createTtls = [];

    public function handshake(string $ownerRef, int $timeoutMilliseconds = 5000): TalosBrowserWorkerHandshake
    {
        return (new FakeBrowserSessionClient)->handshake($ownerRef, $timeoutMilliseconds);
    }

    public function toolDefinitions(string $ownerRef): array
    {
        throw new \LogicException('Browser search must not use tool definitions.');
    }

    public function callTool(
        string $ownerRef,
        string $workerSessionId,
        string $toolUseId,
        string $name,
        array $arguments,
        int $timeoutMs = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): BrowserToolResult {
        throw new \LogicException('Browser search must use the session lifecycle API.');
    }

    public function stageFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        array $file,
        int $timeoutMilliseconds = 15000,
    ): array {
        throw new \LogicException('Browser search must not stage upload files.');
    }

    public function discardStagedFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        int $timeoutMilliseconds = 15000,
    ): void {
        throw new \LogicException('Browser search must not discard staged upload files.');
    }

    public function scroll(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        throw new \LogicException('Browser search must not scroll via the HMI API.');
    }

    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array
    {
        $this->timeouts['create'][] = $timeoutMilliseconds;
        $this->createTtls[] = $ttlSeconds;
        $this->record('create', compact('ownerRef', 'width', 'height'));
        $this->failIfConfigured('create');
        $this->afterCall('create');

        return $this->createResponse ?? [
            'sessionId' => 'worker-1',
            'mode' => 'read_only',
            'status' => 'ready',
        ];
    }

    public function createIdempotent(
        string $ownerRef,
        int $width,
        int $height,
        string $idempotencyKey,
        int $timeoutMilliseconds = 15000,
        int $ttlSeconds = 3600,
    ): array {
        return $this->create($ownerRef, $width, $height, $timeoutMilliseconds, $ttlSeconds);
    }

    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        throw new \LogicException('Browser search must not inspect a session.');
    }

    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array
    {
        $this->timeouts['navigate'][] = $timeoutMilliseconds;
        $this->record('navigate', compact('ownerRef', 'workerSessionId', 'url'));
        $this->failIfConfigured('navigate');
        $this->afterCall('navigate');

        return ['url' => $url, 'title' => 'Search'];
    }

    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        throw new \LogicException('Browser search must not capture screenshots.');
    }

    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        $this->timeouts['snapshot'][] = $timeoutMilliseconds;
        $this->record('snapshot', compact('ownerRef', 'workerSessionId'));
        $this->failIfConfigured('snapshot');
        $this->afterCall('snapshot');

        return $this->snapshotResponse;
    }

    public function preflightPointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        throw new \LogicException('Browser search must not use HMI pointer preflight.');
    }

    public function refTargets(
        string $ownerRef,
        string $workerSessionId,
        int $stateVersion,
        string $expectedFrameSha256,
        int $timeoutMilliseconds = 15000,
    ): array {
        throw new \LogicException('Browser search must not list HMI ref targets.');
    }

    public function preflightRef(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        throw new \LogicException('Browser search must not use HMI ref preflight.');
    }

    public function executePointer(
        string $ownerRef,
        string $workerSessionId,
        array $payload,
        int $timeoutMilliseconds = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): array {
        throw new \LogicException('Browser search must not use HMI pointer execution.');
    }

    public function executeRef(
        string $ownerRef,
        string $workerSessionId,
        array $payload,
        int $timeoutMilliseconds = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): array {
        throw new \LogicException('Browser search must not use HMI ref execution.');
    }

    public function close(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): void
    {
        $this->timeouts['close'][] = $timeoutMilliseconds;
        $this->record('close', compact('ownerRef', 'workerSessionId'));
        $this->afterCall('close');
    }

    public function cancel(string $ownerRef, string $workerSessionId, string $reason, int $timeoutMilliseconds = 15000): void
    {
        throw new \LogicException('Browser search must not cancel a durable Browser task.');
    }

    /** @param array<string, mixed> $arguments */
    private function record(string $method, array $arguments): void
    {
        $this->calls[] = ['method' => $method, ...$arguments];
    }

    private function failIfConfigured(string $method): void
    {
        if ($this->failureMethod === $method) {
            throw new \RuntimeException('browser failure');
        }
    }

    private function afterCall(string $method): void
    {
        if (is_callable($this->afterCall)) {
            ($this->afterCall)($method);
        }
    }
}
