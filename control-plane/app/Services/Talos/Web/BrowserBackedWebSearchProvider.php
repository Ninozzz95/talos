<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Browser\BrowserSessionClient;
use Closure;
use DateTimeImmutable;
use DateTimeInterface;
use RuntimeException;
use Throwable;

final class BrowserBackedWebSearchProvider implements WebSearchProvider
{
    private const MAX_QUERY_BYTES = 512;

    private const MAX_URL_BYTES = 2048;

    private const MAX_TITLE_BYTES = 512;

    private const MAX_RESULTS = 10;

    private const MAX_DISTINCT_AUTHORITIES = 16;

    private const MAX_TIMEOUT_MILLISECONDS = 8000;

    private const MAX_CLEANUP_MILLISECONDS = 100;

    private const SEARCH_SESSION_TTL_SECONDS = 15;

    private const SOURCE = 'browser_backed';

    /** @var Closure(): float */
    private readonly Closure $monotonicClock;

    private readonly int $timeoutMilliseconds;

    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly PublicHttpUrlPolicy $publicUrlPolicy,
        private readonly string $ownerRef,
        public readonly string $searchOrigin,
        public readonly bool $enabled,
        private readonly ?Closure $clock = null,
        int $timeoutMilliseconds = self::MAX_TIMEOUT_MILLISECONDS,
        ?Closure $monotonicClock = null,
    ) {
        $this->timeoutMilliseconds = max(1, min(self::MAX_TIMEOUT_MILLISECONDS, $timeoutMilliseconds));
        $this->monotonicClock = $monotonicClock ?? static fn (): float => hrtime(true) / 1_000_000_000;
    }

    public function privacyEffect(): string
    {
        return 'query_and_result_urls_leave_the_control_plane_via_read_only_chromium';
    }

    /** @param array{language?: string, pageno?: int, time_range?: ?string, safesearch?: int} $options */
    public function search(string $query, array $options = []): WebSearchResponse
    {
        try {
            $deadline = $this->monotonicNow() + ($this->timeoutMilliseconds / 1000);
        } catch (Throwable) {
            return WebSearchResponse::unavailable('browser_unavailable');
        }

        if (! $this->enabled) {
            return WebSearchResponse::unavailable('provider_disabled');
        }

        $normalizedQuery = trim($query);
        if ($normalizedQuery === '') {
            return WebSearchResponse::unavailable('query_empty');
        }
        if (strlen($normalizedQuery) > self::MAX_QUERY_BYTES) {
            return WebSearchResponse::unavailable('query_too_large');
        }

        $parameters = $this->parameters($options);
        if ($parameters === null) {
            return WebSearchResponse::unavailable('invalid_options');
        }

        $url = $this->queryUrl($normalizedQuery, $parameters);
        if ($url === null) {
            return WebSearchResponse::unavailable('search_origin_blocked');
        }

        $sessionId = null;
        $response = null;
        try {
            $session = $this->client->create($this->ownerRef, 1280, 800, $this->operationTimeout($deadline), self::SEARCH_SESSION_TTL_SECONDS);
            $sessionId = is_string($session['sessionId'] ?? null) ? trim($session['sessionId']) : null;
            $this->assertWithinDeadline($deadline);
            if (! is_string($sessionId) || $sessionId === '' || ($session['mode'] ?? null) !== 'read_only') {
                $response = WebSearchResponse::unavailable('browser_session_invalid');
            } else {
                $this->client->navigate($this->ownerRef, $sessionId, $url, $this->operationTimeout($deadline));
                $this->assertWithinDeadline($deadline);
                $snapshot = $this->client->snapshot($this->ownerRef, $sessionId, $this->operationTimeout($deadline));
                $this->assertWithinDeadline($deadline);

                $response = $this->normalizeSnapshot($snapshot, $deadline);
                $this->assertWithinDeadline($deadline);
            }
        } catch (BrowserSearchDeadlineExceeded) {
            $response = WebSearchResponse::unavailable('browser_timeout');
        } catch (Throwable) {
            $response = $this->failureResponse($deadline);
        } finally {
            if (is_string($sessionId) && $sessionId !== '') {
                try {
                    $this->client->close($this->ownerRef, $sessionId, self::MAX_CLEANUP_MILLISECONDS);
                } catch (Throwable) {
                    // The browser operation already has an honest result; cleanup must not expose worker details.
                }
            }
        }

        try {
            if ($this->deadlineExceeded($deadline)) {
                return WebSearchResponse::unavailable('browser_timeout');
            }
        } catch (Throwable) {
            return WebSearchResponse::unavailable('browser_unavailable');
        }

        return $response ?? WebSearchResponse::unavailable('browser_unavailable');
    }

    /** @param array<string, string|int> $parameters */
    private function queryUrl(string $query, array $parameters): ?string
    {
        $origin = trim($this->searchOrigin);
        $parts = parse_url($origin);
        if (! is_array($parts)
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || trim($parts['host']) === '') {
            return null;
        }

        try {
            $decision = $this->inspectBrowserUrl($origin);
        } catch (Throwable) {
            return null;
        }
        if (! $decision['allowed']) {
            return null;
        }

        $queryPart = http_build_query(['q' => $query, ...$parameters], '', '&', PHP_QUERY_RFC3986);
        $url = rtrim($origin, '/').'?'.$queryPart;

        return strlen($url) <= self::MAX_URL_BYTES ? $url : null;
    }

    /** @param array<string, mixed> $snapshot */
    private function normalizeSnapshot(array $snapshot, float $deadline): WebSearchResponse
    {
        $nodes = $snapshot['nodes'] ?? null;
        if (! is_array($nodes) || ! array_is_list($nodes)) {
            return WebSearchResponse::unavailable('malformed_snapshot');
        }

        $retrievedAt = $this->retrievedAt();
        $results = [];
        $seenUrls = [];
        $authorityDecisions = [];
        foreach ($nodes as $node) {
            $this->assertWithinDeadline($deadline);
            if (! is_array($node) || array_is_list($node) || ($node['role'] ?? null) !== 'link') {
                continue;
            }

            $title = $node['name'] ?? null;
            $href = $node['href'] ?? null;
            if (! is_string($title) || trim($title) === '' || strlen($title) > self::MAX_TITLE_BYTES
                || ! is_string($href) || trim($href) === '' || strlen($href) > self::MAX_URL_BYTES) {
                continue;
            }

            $canonicalUrl = $this->canonicalUrl($href);
            if ($canonicalUrl === null) {
                continue;
            }
            $deduplicationKey = $this->deduplicationKey($canonicalUrl);
            if (isset($seenUrls[$deduplicationKey])) {
                continue;
            }
            $seenUrls[$deduplicationKey] = true;
            $authority = $this->authorityKey($canonicalUrl);
            if ($authority === null) {
                continue;
            }
            if (! array_key_exists($authority, $authorityDecisions)) {
                if (count($authorityDecisions) >= self::MAX_DISTINCT_AUTHORITIES) {
                    continue;
                }
                try {
                    $authorityDecisions[$authority] = $this->inspectBrowserUrl($canonicalUrl)['allowed'];
                } catch (Throwable) {
                    $authorityDecisions[$authority] = false;
                }
                $this->assertWithinDeadline($deadline);
            }
            if (! $authorityDecisions[$authority]) {
                continue;
            }

            $title = trim(strip_tags($title));
            if ($title === '') {
                continue;
            }
            $rank = count($results) + 1;
            $results[] = WebSearchResult::fromFields($title, $canonicalUrl, '', self::SOURCE, $rank, $retrievedAt);
            if (count($results) === self::MAX_RESULTS) {
                break;
            }
        }

        return WebSearchResponse::available($results);
    }

    /** @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} */
    private function inspectBrowserUrl(string $url): array
    {
        // Browser Worker/BrowserEgressProxy owns connection-time DNS and SSRF checks; PHP must not consume the aggregate deadline.
        return $this->publicUrlPolicy->inspect($url, resolveHostname: false);
    }

    /** @param array<string, mixed> $options @return array<string, string|int>|null */
    private function parameters(array $options): ?array
    {
        $known = ['language', 'pageno', 'time_range', 'safesearch'];
        foreach (array_keys($options) as $key) {
            if (! is_string($key) || ! in_array($key, $known, true)) {
                return null;
            }
        }

        $parameters = [];
        if (array_key_exists('language', $options)) {
            $language = $options['language'];
            if (! is_string($language) || strlen($language) > 32 || preg_match('/\A[A-Za-z0-9_-]+\z/', $language) !== 1) {
                return null;
            }
            $parameters['language'] = $language;
        }
        if (array_key_exists('pageno', $options)) {
            $page = $options['pageno'];
            if (! is_int($page) || $page < 1 || $page > 100) {
                return null;
            }
            $parameters['pageno'] = $page;
        }
        if (array_key_exists('time_range', $options)) {
            $timeRange = $options['time_range'];
            if ($timeRange !== null && $timeRange !== '' && ! in_array($timeRange, ['day', 'month', 'year'], true)) {
                return null;
            }
            $parameters['time_range'] = $timeRange ?? '';
        }
        if (array_key_exists('safesearch', $options)) {
            $safeSearch = $options['safesearch'];
            if (! is_int($safeSearch) || $safeSearch < 0 || $safeSearch > 2) {
                return null;
            }
            $parameters['safesearch'] = $safeSearch;
        }

        return $parameters;
    }

    private function authorityKey(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ! is_string($parts['scheme'] ?? null) || ! is_string($parts['host'] ?? null)) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);

        return $scheme.'://'.strtolower($parts['host']).':'.(int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
    }

    private function canonicalUrl(string $url): ?string
    {
        try {
            $parts = parse_url(trim($url));
        } catch (Throwable) {
            return null;
        }
        if (! is_array($parts) || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }
        $port = $parts['port'] ?? null;
        if ($port !== null && (! is_int($port) || $port < 1 || $port > 65535)) {
            return null;
        }
        if (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) {
            $port = null;
        }

        $path = (string) ($parts['path'] ?? '/');
        $path = $path === '' ? '/' : $path;
        $query = array_key_exists('query', $parts) ? '?'.(string) $parts['query'] : '';
        $fragment = array_key_exists('fragment', $parts) ? '#'.(string) $parts['fragment'] : '';
        $host = str_contains($host, ':') ? "[{$host}]" : $host;

        return $scheme.'://'.$host.($port === null ? '' : ':'.$port).$path.$query.$fragment;
    }

    private function deduplicationKey(string $url): string
    {
        $fragmentOffset = strpos($url, '#');

        return $fragmentOffset === false ? $url : substr($url, 0, $fragmentOffset);
    }

    private function retrievedAt(): string
    {
        $value = ($this->clock ?? static fn (): string => (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM))();

        return (new DateTimeImmutable($value))->format(DateTimeInterface::ATOM);
    }

    private function operationTimeout(float $deadline): int
    {
        $remaining = $this->remainingMilliseconds($deadline);
        if ($remaining <= 0) {
            throw new BrowserSearchDeadlineExceeded;
        }

        return $remaining;
    }

    private function assertWithinDeadline(float $deadline): void
    {
        if ($this->deadlineExceeded($deadline)) {
            throw new BrowserSearchDeadlineExceeded;
        }
    }

    private function deadlineExceeded(float $deadline): bool
    {
        return $this->monotonicNow() >= $deadline;
    }

    private function remainingMilliseconds(float $deadline): int
    {
        return max(0, (int) floor(($deadline - $this->monotonicNow()) * 1000));
    }

    private function monotonicNow(): float
    {
        $value = ($this->monotonicClock)();
        if (! is_finite($value) || $value < 0) {
            throw new RuntimeException('Monotonic clock returned an invalid value.');
        }

        return $value;
    }

    private function failureResponse(float $deadline): WebSearchResponse
    {
        try {
            return WebSearchResponse::unavailable($this->deadlineExceeded($deadline) ? 'browser_timeout' : 'browser_unavailable');
        } catch (Throwable) {
            return WebSearchResponse::unavailable('browser_unavailable');
        }
    }
}

final class BrowserSearchDeadlineExceeded extends RuntimeException {}
