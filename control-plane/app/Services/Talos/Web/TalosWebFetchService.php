<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use Closure;
use DOMDocument;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use JsonException;

final class TalosWebFetchService
{
    private const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/json'];

    private const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

    private const MAX_URL_BYTES = 2048;

    private const MAX_TIMEOUT_MS = 15000;

    private readonly PublicHttpUrlPolicy $policy;

    private readonly PublicHttpRequestPinning $pinning;

    private readonly Closure $clock;

    /** @var Closure(): float */
    private readonly Closure $monotonicClock;

    public function __construct(?PublicHttpUrlPolicy $policy = null, ?PublicHttpRequestPinning $pinning = null, ?callable $clock = null, ?callable $monotonicClock = null)
    {
        $this->policy = $policy ?? new PublicHttpUrlPolicy;
        $this->pinning = $pinning ?? new PublicHttpRequestPinning($this->policy);
        $this->clock = $clock !== null ? Closure::fromCallable($clock) : static fn (): string => now()->toJSON();
        $this->monotonicClock = $monotonicClock !== null
            ? Closure::fromCallable($monotonicClock)
            : static fn (): float => hrtime(true) / 1_000_000_000;
    }

    public function fetch(string $url, int $timeoutMs = 10000, int $maxBytes = 1000000, int $maxRedirects = 3): WebFetchResult
    {
        if ($maxBytes < 1 || $maxBytes > 10000000 || $maxRedirects < 0 || $maxRedirects > 10) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_BOUNDS', 'Web fetch bounds are invalid.');
        }
        $timeoutMs = min(max(1, $timeoutMs), self::MAX_TIMEOUT_MS);
        $deadline = $this->monotonicNow() + ($timeoutMs / 1000);
        $currentUrl = $this->normalizeUrl($url);
        $this->remainingSeconds($deadline);
        $redirectChain = [];
        $redirectCount = 0;

        while (true) {
            $this->remainingSeconds($deadline);
            $pin = $this->approvedPin($currentUrl);
            $remainingSeconds = $this->remainingSeconds($deadline);
            try {
                $request = Http::connectTimeout(min(5.0, $remainingSeconds))
                    ->timeout($remainingSeconds)
                    ->withHeaders([
                        'Accept' => 'text/html, text/plain, application/json',
                        'Accept-Encoding' => 'gzip, deflate',
                        'User-Agent' => 'TALOS-WebFetch/1.0',
                    ])
                    ->withOptions(['decode_content' => true, 'stream' => true]);
                $request = $this->pinning->apply($request, $pin);
            } catch (TalosWebFetchException $exception) {
                throw $exception;
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_PINNING_UNAVAILABLE', 'Web fetch connection could not be pinned safely.');
            }
            $this->remainingSeconds($deadline);

            try {
                $response = $request->get($currentUrl);
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_UNAVAILABLE', 'Web fetch endpoint is unavailable.');
            }

            $this->remainingSeconds($deadline);
            try {
                $connectedToPinnedIp = $this->pinning->connectedToPinnedIp($response, $pin);
            } catch (\Throwable) {
                $connectedToPinnedIp = false;
            }
            if (! $connectedToPinnedIp) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_PRIMARY_IP_MISMATCH', 'Web fetch connection did not use the approved address.');
            }

            $this->remainingSeconds($deadline);
            try {
                $status = $response->status();
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_UNAVAILABLE', 'Web fetch endpoint is unavailable.');
            }

            if (in_array($status, self::REDIRECT_STATUSES, true)) {
                if ($redirectCount >= $maxRedirects) {
                    throw new TalosWebFetchException('TALOS_WEB_FETCH_REDIRECT_LIMIT', 'Web fetch redirect limit was exceeded.');
                }
                try {
                    $location = trim($response->header('Location'));
                } catch (\Throwable) {
                    throw new TalosWebFetchException('TALOS_WEB_FETCH_REDIRECT_INVALID', 'Web fetch redirect did not include a valid target.');
                }
                if ($location === '') {
                    throw new TalosWebFetchException('TALOS_WEB_FETCH_REDIRECT_INVALID', 'Web fetch redirect did not include a valid target.');
                }
                if ($redirectChain === []) {
                    $redirectChain[] = $currentUrl;
                }
                $currentUrl = $this->resolveRedirect($currentUrl, $location);
                $this->remainingSeconds($deadline);
                $redirectChain[] = $currentUrl;
                $redirectCount++;

                continue;
            }
            try {
                $successful = $response->successful();
                $declaredBytes = trim($response->header('Content-Length'));
                $transferEncoding = trim($response->header('Transfer-Encoding'));
                $downloadedBytes = $response->handlerStats()['size_download'] ?? null;
                $contentType = strtolower(trim(explode(';', $response->header('Content-Type'), 2)[0]));
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_UNAVAILABLE', 'Web fetch endpoint is unavailable.');
            }
            $this->remainingSeconds($deadline);

            if (! $successful) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_HTTP_STATUS', 'Web fetch endpoint returned an unsuccessful status.');
            }

            if ($declaredBytes !== '' && $transferEncoding !== '') {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch response framing is ambiguous.');
            }
            if ($declaredBytes !== '' && ! ctype_digit($declaredBytes)) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch content length is invalid.');
            }
            if ($declaredBytes !== '' && ctype_digit($declaredBytes) && (int) $declaredBytes > $maxBytes) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_TOO_LARGE', 'Web fetch content exceeded the byte budget.');
            }
            if (is_numeric($downloadedBytes) && (float) $downloadedBytes > $maxBytes) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_TOO_LARGE', 'Web fetch compressed content exceeded the byte budget.');
            }

            try {
                $body = $this->boundedBody($response, $maxBytes, $deadline);
            } catch (TalosWebFetchException $exception) {
                throw $exception;
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch content is invalid.');
            }
            if (! in_array($contentType, self::ALLOWED_CONTENT_TYPES, true)) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_TYPE', 'Web fetch content type is not supported.');
            }

            $content = $this->extractContent($body, $contentType, $deadline);
            $this->remainingSeconds($deadline);
            try {
                $fetchedAt = $this->fetchedAt();
                $this->remainingSeconds($deadline);

                return WebFetchResult::fromFetchedBody(
                    $currentUrl,
                    $contentType,
                    $content,
                    $body,
                    $fetchedAt,
                    $redirectChain,
                );
            } catch (TalosWebFetchException $exception) {
                throw $exception;
            } catch (\Throwable) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch content is invalid.');
            }
        }
    }

    /** @return array{allowed: bool, code: ?string, reason: string, host: string, resolved_ips: list<string>, curl_resolve: list<string>, requires_pinning: bool, trusted_local: bool, policy: array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}} */
    private function approvedPin(string $url): array
    {
        try {
            $decision = $this->policy->inspect($url, requireResolution: true);
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_URL_BLOCKED', 'Web fetch URL was blocked by policy.');
        }
        if (! $decision['allowed']) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_URL_BLOCKED', 'Web fetch URL was blocked by policy.');
        }
        try {
            $pin = $this->pinning->pin($url);
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_PINNING_UNAVAILABLE', 'Web fetch connection could not be pinned safely.');
        }
        if (! $pin['allowed']) {
            $code = $pin['code'] === 'BASE_URL_POLICY_BLOCKED' ? 'TALOS_WEB_FETCH_URL_BLOCKED' : 'TALOS_WEB_FETCH_PINNING_UNAVAILABLE';
            throw new TalosWebFetchException($code, 'Web fetch connection could not be pinned safely.');
        }

        return $pin;
    }

    private function normalizeUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > self::MAX_URL_BYTES) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_URL_BLOCKED', 'Web fetch URL was blocked by policy.');
        }
        try {
            $normalized = (new Uri($url))->withFragment('')->__toString();
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_URL_BLOCKED', 'Web fetch URL was blocked by policy.');
        }

        return $normalized;
    }

    private function resolveRedirect(string $currentUrl, string $location): string
    {
        if (strlen($location) > self::MAX_URL_BYTES) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_REDIRECT_INVALID', 'Web fetch redirect target is invalid.');
        }
        try {
            return $this->normalizeUrl(UriResolver::resolve(new Uri($currentUrl), new Uri($location))->__toString());
        } catch (TalosWebFetchException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_REDIRECT_INVALID', 'Web fetch redirect target is invalid.');
        }
    }

    private function extractContent(string $body, string $contentType, float $deadline): string
    {
        try {
            $this->remainingSeconds($deadline);
            if ($contentType === 'application/json') {
                try {
                    $decoded = json_decode($body, true, 64, JSON_THROW_ON_ERROR);

                    $content = json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                } catch (JsonException) {
                    throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch JSON content is invalid.');
                }
                $this->remainingSeconds($deadline);

                return $content;
            }
            if ($contentType === 'text/plain') {
                $content = $this->normalizeText($body);
                $this->remainingSeconds($deadline);

                return $content;
            }

            $document = new DOMDocument;
            $previous = libxml_use_internal_errors(true);
            try {
                $loaded = $document->loadHTML('<?xml encoding="utf-8" ?>'.$body, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
            } finally {
                libxml_clear_errors();
                libxml_use_internal_errors($previous);
            }
            if (! $loaded) {
                throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch HTML content is invalid.');
            }
            foreach (['script', 'style', 'noscript', 'template', 'svg'] as $tag) {
                $this->remainingSeconds($deadline);
                while (($node = $document->getElementsByTagName($tag)->item(0)) !== null) {
                    $node->parentNode?->removeChild($node);
                }
            }

            $parts = [];
            $nodes = (new \DOMXPath($document))->query('//body//text()[normalize-space()]');
            if ($nodes !== false) {
                foreach ($nodes as $node) {
                    $this->remainingSeconds($deadline);
                    $text = $this->normalizeText((string) $node->nodeValue);
                    if ($text !== '') {
                        $parts[] = $text;
                    }
                }
            }
            $this->remainingSeconds($deadline);

            return implode(' ', $parts);
        } catch (TalosWebFetchException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch content is invalid.');
        }
    }

    private function boundedBody(Response $response, int $maxBytes, float $deadline): string
    {
        try {
            $stream = $response->toPsrResponse()->getBody();
            $body = '';
            while (true) {
                $this->remainingSeconds($deadline);
                if ($stream->eof()) {
                    break;
                }
                $remaining = $maxBytes - strlen($body);
                $chunk = $stream->read(min(8192, $remaining + 1));
                if ($chunk === '') {
                    break;
                }
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_TOO_LARGE', 'Web fetch content exceeded the byte budget.');
                }
            }
            $this->remainingSeconds($deadline);

            return $body;
        } catch (TalosWebFetchException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_CONTENT_INVALID', 'Web fetch content is invalid.');
        }
    }

    private function monotonicNow(): float
    {
        try {
            $now = ($this->monotonicClock)();
            if ((! is_int($now) && ! is_float($now)) || ! is_finite((float) $now)) {
                throw new \RuntimeException('Invalid monotonic clock value.');
            }

            return (float) $now;
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_TIMEOUT', 'Web fetch wall-clock budget was exhausted.');
        }
    }

    private function remainingSeconds(float $deadline): float
    {
        $remaining = $deadline - $this->monotonicNow();
        if ($remaining <= 0) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_TIMEOUT', 'Web fetch wall-clock budget was exhausted.');
        }

        return max(0.001, $remaining);
    }

    private function fetchedAt(): string
    {
        try {
            $fetchedAt = ($this->clock)();
            if (! is_string($fetchedAt) || trim($fetchedAt) === '') {
                throw new \RuntimeException('Invalid fetch timestamp.');
            }

            return $fetchedAt;
        } catch (\Throwable) {
            throw new TalosWebFetchException('TALOS_WEB_FETCH_TIMEOUT', 'Web fetch wall-clock budget was exhausted.');
        }
    }

    private function normalizeText(string $text): string
    {
        $normalized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', ' ', $text);
        $normalized = preg_replace('/\s+/u', ' ', is_string($normalized) ? $normalized : '');

        return trim(is_string($normalized) ? $normalized : '');
    }
}
