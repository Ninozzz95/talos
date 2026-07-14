<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Closure;
use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

final class SearxngWebSearchProvider implements WebSearchProvider
{
    private const MAX_QUERY_BYTES = 512;

    private const MAX_RESPONSE_BYTES = 1024 * 1024;

    private const MAX_RESULTS = 10;

    private const MAX_RAW_RESULTS = 64;

    private const MAX_DISTINCT_AUTHORITIES = 16;

    private const MAX_TIMEOUT_SECONDS = 8;

    private readonly PublicHttpUrlPolicy $endpointPolicy;

    private readonly PublicHttpRequestPinning $connectionPinning;

    private readonly PublicHttpUrlPolicy $resultUrlPolicy;

    /** @var Closure(): string */
    private readonly Closure $clock;

    /** @var Closure(): float */
    private readonly Closure $monotonicClock;

    public function __construct(
        private readonly string $endpoint,
        ?PublicHttpUrlPolicy $endpointPolicy = null,
        ?PublicHttpRequestPinning $connectionPinning = null,
        ?PublicHttpUrlPolicy $resultUrlPolicy = null,
        ?Closure $clock = null,
        private readonly int $timeoutSeconds = self::MAX_TIMEOUT_SECONDS,
        ?Closure $monotonicClock = null,
    ) {
        $host = parse_url(trim($this->endpoint), PHP_URL_HOST);
        $this->endpointPolicy = $endpointPolicy ?? (is_string($host) && $host !== ''
            ? PublicHttpUrlPolicy::forProviderHosts([$host])
            : new PublicHttpUrlPolicy);
        $this->connectionPinning = $connectionPinning ?? new PublicHttpRequestPinning($this->endpointPolicy);
        $this->resultUrlPolicy = $resultUrlPolicy ?? new PublicHttpUrlPolicy;
        $this->clock = $clock ?? static fn (): string => (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM);
        $this->monotonicClock = $monotonicClock ?? static fn (): float => hrtime(true) / 1_000_000_000;
    }

    /** @param array{language?: string, pageno?: int, time_range?: ?string, safesearch?: int} $options */
    public function search(string $query, array $options = []): WebSearchResponse
    {
        try {
            return $this->executeSearch($query, $options);
        } catch (WebSearchDeadlineExceeded) {
            return WebSearchResponse::unavailable('timeout');
        } catch (WebSearchClockFailure) {
            return WebSearchResponse::unavailable('provider_unavailable');
        }
    }

    /** @param array{language?: string, pageno?: int, time_range?: ?string, safesearch?: int} $options */
    private function executeSearch(string $query, array $options): WebSearchResponse
    {
        $timeout = max(1, min(self::MAX_TIMEOUT_SECONDS, $this->timeoutSeconds));
        try {
            $deadline = $this->monotonicNow() + $timeout;
        } catch (WebSearchDeadlineExceeded|WebSearchClockFailure $exception) {
            throw $exception;
        } catch (Throwable) {
            return WebSearchResponse::unavailable('provider_unavailable');
        }

        $normalizedQuery = trim($query);
        if ($normalizedQuery === '') {
            return WebSearchResponse::unavailable('query_empty');
        }
        if (strlen($normalizedQuery) > self::MAX_QUERY_BYTES) {
            return WebSearchResponse::unavailable('query_too_large');
        }

        $parameters = $this->parameters($normalizedQuery, $options);
        if ($parameters === null) {
            return WebSearchResponse::unavailable('invalid_options');
        }

        $url = $this->searchUrl();
        try {
            $policy = $this->endpointPolicy->inspect($url, requireResolution: true);
        } catch (Throwable) {
            return WebSearchResponse::unavailable('endpoint_blocked');
        }
        if (! $policy['allowed']) {
            return WebSearchResponse::unavailable('endpoint_blocked');
        }
        if ($this->deadlineExceeded($deadline)) {
            return WebSearchResponse::unavailable('timeout');
        }

        try {
            $pin = $this->connectionPinning->pin($url);
        } catch (Throwable) {
            return WebSearchResponse::unavailable('connection_pinning_unavailable');
        }
        if (! $pin['allowed']) {
            return WebSearchResponse::unavailable(
                $pin['code'] === 'BASE_URL_POLICY_BLOCKED' ? 'endpoint_blocked' : 'connection_pinning_unavailable',
            );
        }
        if ($this->deadlineExceeded($deadline)) {
            return WebSearchResponse::unavailable('timeout');
        }

        $remainingSeconds = $this->remainingSeconds($deadline);
        if ($remainingSeconds <= 0) {
            return WebSearchResponse::unavailable('timeout');
        }
        try {
            $response = $this->connectionPinning->apply(
                Http::timeout($remainingSeconds)->connectTimeout($remainingSeconds)->acceptJson()->withOptions(['stream' => true]),
                $pin,
            )->get($url, $parameters);
        } catch (Throwable) {
            return WebSearchResponse::unavailable('provider_unavailable');
        }
        if ($this->deadlineExceeded($deadline)) {
            return WebSearchResponse::unavailable('timeout');
        }

        try {
            if (! $this->connectionPinning->connectedToPinnedIp($response, $pin)) {
                return WebSearchResponse::unavailable('connected_ip_mismatch');
            }
            if (! $response->successful()) {
                return WebSearchResponse::unavailable('provider_unavailable');
            }
            $contentType = strtolower(trim(explode(';', $response->header('Content-Type'), 2)[0]));
            if ($contentType !== 'application/json') {
                return WebSearchResponse::unavailable('unsupported_content_type');
            }

            $declaredBytes = trim($response->header('Content-Length'));
            $transferEncoding = trim($response->header('Transfer-Encoding'));
            if (($declaredBytes !== '' && $transferEncoding !== '') || ($declaredBytes !== '' && ! ctype_digit($declaredBytes))) {
                return WebSearchResponse::unavailable('malformed_response');
            }
            if ($declaredBytes !== '' && (int) $declaredBytes > self::MAX_RESPONSE_BYTES) {
                return WebSearchResponse::unavailable('response_too_large');
            }
            $body = $this->boundedBody($response, $deadline);
            if ($body === null) {
                return WebSearchResponse::unavailable('response_too_large');
            }
        } catch (WebSearchDeadlineExceeded|WebSearchClockFailure $exception) {
            throw $exception;
        } catch (Throwable) {
            return WebSearchResponse::unavailable('provider_unavailable');
        }
        if ($this->deadlineExceeded($deadline)) {
            return WebSearchResponse::unavailable('timeout');
        }

        try {
            $payload = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return WebSearchResponse::unavailable('malformed_response');
        }
        if (! is_array($payload) || array_is_list($payload) || ! is_array($payload['results'] ?? null) || ! array_is_list($payload['results'])) {
            return WebSearchResponse::unavailable('malformed_response');
        }

        return $this->normalizeResults($payload['results'], $deadline);
    }

    private function boundedBody(Response $response, float $deadline): ?string
    {
        $stream = $response->toPsrResponse()->getBody();
        $body = '';
        while (! $stream->eof()) {
            if ($this->deadlineExceeded($deadline)) {
                throw new WebSearchDeadlineExceeded;
            }
            $remaining = self::MAX_RESPONSE_BYTES - strlen($body);
            $chunk = $stream->read(min(8192, $remaining + 1));
            if ($chunk === '') {
                break;
            }
            $body .= $chunk;
            if (strlen($body) > self::MAX_RESPONSE_BYTES) {
                return null;
            }
        }

        return $body;
    }

    private function searchUrl(): string
    {
        $base = rtrim(trim($this->endpoint), '/');

        return str_ends_with(strtolower($base), '/search') ? $base : $base.'/search';
    }

    /** @param array{language?: string, pageno?: int, time_range?: ?string, safesearch?: int} $options @return array{q: string, format: string, language: string, pageno: int, time_range: string, safesearch: int}|null */
    private function parameters(string $query, array $options): ?array
    {
        foreach (array_keys($options) as $key) {
            if (! is_string($key) || ! in_array($key, ['language', 'pageno', 'time_range', 'safesearch'], true)) {
                return null;
            }
        }

        $language = $options['language'] ?? 'auto';
        $page = $options['pageno'] ?? 1;
        $timeRange = $options['time_range'] ?? null;
        $safeSearch = $options['safesearch'] ?? 1;

        if (! is_string($language) || strlen($language) > 32 || preg_match('/\A[A-Za-z0-9_-]+\z/', $language) !== 1) {
            return null;
        }
        if (! is_int($page) || $page < 1 || $page > 100) {
            return null;
        }
        if ($timeRange !== null && $timeRange !== '' && ! in_array($timeRange, ['day', 'month', 'year'], true)) {
            return null;
        }
        if (! is_int($safeSearch) || $safeSearch < 0 || $safeSearch > 2) {
            return null;
        }

        return [
            'q' => $query,
            'format' => 'json',
            'language' => $language,
            'pageno' => $page,
            'time_range' => $timeRange ?? '',
            'safesearch' => $safeSearch,
        ];
    }

    /** @param list<mixed> $items */
    private function normalizeResults(array $items, float $deadline): WebSearchResponse
    {
        try {
            $retrievedAt = $this->timestamp(($this->clock)());
        } catch (Throwable) {
            return WebSearchResponse::unavailable('result_policy_unavailable');
        }
        $results = [];
        $seenUrls = [];
        $authorityDecisions = [];
        $processed = 0;

        foreach ($items as $item) {
            if ($processed === self::MAX_RAW_RESULTS) {
                break;
            }
            $processed++;
            if ($this->deadlineExceeded($deadline)) {
                return WebSearchResponse::unavailable('timeout');
            }
            if (! is_array($item) || array_is_list($item)) {
                return WebSearchResponse::unavailable('malformed_response');
            }

            try {
                $result = $this->normalizeItem(
                    $item,
                    $retrievedAt,
                    count($results) + 1,
                    $seenUrls,
                    $authorityDecisions,
                );
            } catch (InvalidArgumentException) {
                return WebSearchResponse::unavailable('malformed_response');
            } catch (Throwable) {
                return WebSearchResponse::unavailable('result_policy_unavailable');
            }
            if ($this->deadlineExceeded($deadline)) {
                return WebSearchResponse::unavailable('timeout');
            }
            if ($result === null) {
                continue;
            }

            $results[] = $result;
            if (count($results) === self::MAX_RESULTS) {
                break;
            }
        }

        return WebSearchResponse::available($results);
    }

    /** @param array<string, mixed> $item */
    private function normalizeItem(
        array $item,
        string $retrievedAt,
        int $rank,
        array &$seenUrls,
        array &$authorityDecisions,
    ): ?WebSearchResult {
        $title = $item['title'] ?? null;
        $url = $item['url'] ?? null;
        $snippet = $item['content'] ?? ($item['snippet'] ?? '');
        $source = $item['engine'] ?? null;
        if ($source === null && is_array($item['engines'] ?? null) && is_string($item['engines'][0] ?? null)) {
            $source = $item['engines'][0];
        }
        $source ??= 'searxng';

        if (! is_string($title) || trim($title) === '' || strlen($title) > 512
            || ! is_string($url) || strlen($url) > 2048
            || ! is_string($snippet) || strlen($snippet) > 4096
            || ! is_string($source) || trim($source) === '' || strlen($source) > 128) {
            throw new InvalidArgumentException('Malformed search result.');
        }

        $canonicalUrl = $this->canonicalUrl($url);
        if ($canonicalUrl === null) {
            return null;
        }
        $deduplicationKey = $this->deduplicationKey($canonicalUrl);
        if (isset($seenUrls[$deduplicationKey])) {
            return null;
        }
        $seenUrls[$deduplicationKey] = true;
        $authority = $this->authorityKey($canonicalUrl);
        if ($authority === null) {
            return null;
        }
        if (! array_key_exists($authority, $authorityDecisions)) {
            if (count($authorityDecisions) >= self::MAX_DISTINCT_AUTHORITIES) {
                return null;
            }

            $authorityDecisions[$authority] = $this->resultUrlPolicy->inspect($canonicalUrl, requireResolution: true)['allowed'];
        }
        if (! $authorityDecisions[$authority]) {
            return null;
        }

        $publishedDate = $item['publishedDate'] ?? null;
        if ($publishedDate !== null && ! is_string($publishedDate)) {
            throw new InvalidArgumentException('Malformed search timestamp.');
        }
        $timestamp = $this->timestamp($publishedDate !== null && $publishedDate !== '' ? $publishedDate : $retrievedAt, $retrievedAt);
        $title = trim(strip_tags($title));
        $snippet = trim(strip_tags($snippet));
        $source = trim($source);

        return WebSearchResult::fromFields($title, $canonicalUrl, $snippet, $source, $rank, $timestamp);
    }

    private function authorityKey(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ! is_string($parts['scheme'] ?? null) || ! is_string($parts['host'] ?? null)) {
            return null;
        }

        return strtolower($parts['scheme']).'://'.strtolower($parts['host']).':'.(int) ($parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80));
    }

    private function canonicalUrl(string $url): ?string
    {
        $parts = parse_url(trim($url));
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

    private function timestamp(string $value, ?string $fallback = null): string
    {
        try {
            return (new DateTimeImmutable($value))->format(DateTimeInterface::ATOM);
        } catch (Throwable) {
            if ($fallback !== null) {
                return $fallback;
            }
            throw new InvalidArgumentException('Malformed search timestamp.');
        }
    }

    private function monotonicNow(): float
    {
        try {
            $value = ($this->monotonicClock)();
        } catch (Throwable $exception) {
            throw new WebSearchClockFailure(previous: $exception);
        }
        if (! is_finite($value) || $value < 0) {
            throw new WebSearchClockFailure;
        }

        return $value;
    }

    private function deadlineExceeded(float $deadline): bool
    {
        return $this->monotonicNow() >= $deadline;
    }

    private function remainingSeconds(float $deadline): float
    {
        return max(0.0, $deadline - $this->monotonicNow());
    }
}

final class WebSearchDeadlineExceeded extends RuntimeException {}

final class WebSearchClockFailure extends RuntimeException {}
