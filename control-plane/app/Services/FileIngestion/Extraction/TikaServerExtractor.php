<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

use App\Exceptions\TalosExtractionException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use JsonException;

final class TikaServerExtractor implements TalosTextExtractor
{
    private const SUPPORTED_MIME_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    public function supports(string $mimeType): bool
    {
        return in_array(strtolower(trim($mimeType)), self::SUPPORTED_MIME_TYPES, true);
    }

    public function extract(string $absolutePath, string $mimeType): TalosExtractionResult
    {
        $normalizedMime = strtolower(trim($mimeType));
        if (! $this->supports($normalizedMime)) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTOR_UNSUPPORTED',
                'No deterministic document extractor is configured for this file type.',
            );
        }

        $baseUrl = $this->configuredBaseUrl();
        $timeout = $this->positiveConfigInt('talos-files.tika.timeout_seconds');
        $expectedVersion = $this->version();

        $bytes = file_get_contents($absolutePath);
        if (! is_string($bytes)) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTION_READ_FAILED',
                'The quarantined file could not be read for extraction.',
            );
        }

        try {
            $response = Http::acceptJson()
                ->connectTimeout(min(3, $timeout))
                ->timeout($timeout)
                ->withOptions(['stream' => true])
                ->withBody($bytes, $normalizedMime)
                ->put($baseUrl.'/rmeta/text');
        } catch (ConnectionException $exception) {
            throw new TalosExtractionException(
                'TALOS_TIKA_UNAVAILABLE',
                'The document extraction service is unavailable. Retry when Tika is healthy.',
                $exception,
            );
        }

        if (! $response->successful()) {
            throw new TalosExtractionException(
                'TALOS_TIKA_EXTRACTION_FAILED',
                'The document extraction service could not process this file.',
            );
        }

        $body = $this->boundedBody(
            $response,
            $this->positiveConfigInt('talos-files.tika.max_response_bytes'),
            'TALOS_TIKA_RESPONSE_TOO_LARGE',
            'The document extraction response exceeds the configured size limit.',
        );

        try {
            $resources = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new TalosExtractionException(
                'TALOS_TIKA_RESPONSE_MALFORMED',
                'The document extraction service returned an invalid response.',
                $exception,
            );
        }

        if (! is_array($resources) || ! array_is_list($resources) || $resources === []) {
            throw new TalosExtractionException(
                'TALOS_TIKA_RESPONSE_MALFORMED',
                'The document extraction service returned an invalid response.',
            );
        }

        $contents = [];
        $embeddedResources = [];
        $pageCount = null;
        foreach ($resources as $index => $resource) {
            if (! is_array($resource)) {
                throw new TalosExtractionException(
                    'TALOS_TIKA_RESPONSE_MALFORMED',
                    'The document extraction service returned an invalid response.',
                );
            }

            $content = $resource['X-TIKA:content'] ?? null;
            if (is_string($content) && trim($content) !== '') {
                $contents[] = trim($content);
            }

            if ($index === 0) {
                $candidate = $resource['xmpTPg:NPages'] ?? null;
                if (is_int($candidate) || (is_string($candidate) && ctype_digit($candidate))) {
                    $pageCount = (int) $candidate;
                }
            } else {
                $name = $resource['resourceName'] ?? null;
                if (is_string($name) && trim($name) !== '') {
                    $embeddedResources[] = trim($name);
                }
            }
        }

        $text = implode("\n\n", $contents);
        if ($text === '') {
            throw new TalosExtractionException(
                'TALOS_TIKA_EMPTY_OUTPUT',
                'No usable text could be extracted from this document.',
            );
        }
        if (strlen($text) > $this->positiveConfigInt('talos-files.tika.max_extracted_bytes')) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTED_TEXT_TOO_LARGE',
                'The extracted text exceeds the configured size limit.',
            );
        }

        $metadata = [
            'content_type' => $normalizedMime,
            'resource_count' => count($resources),
            'embedded_count' => max(0, count($resources) - 1),
            'embedded_resources' => $embeddedResources,
        ];
        if ($pageCount !== null) {
            $metadata['page_count'] = $pageCount;
        }

        return new TalosExtractionResult(
            text: $text,
            metadata: $metadata,
            extractor: 'apache_tika',
            extractorVersion: $expectedVersion,
            requiresOcr: false,
        );
    }

    public function version(): string
    {
        $baseUrl = $this->configuredBaseUrl();
        $timeout = $this->positiveConfigInt('talos-files.tika.timeout_seconds');
        $expectedVersion = $this->configuredVersion();
        $this->assertPinnedVersion($baseUrl, $timeout, $expectedVersion);

        return $expectedVersion;
    }

    private function assertPinnedVersion(string $baseUrl, int $timeout, string $expectedVersion): void
    {
        try {
            $response = Http::accept('text/plain')
                ->connectTimeout(min(3, $timeout))
                ->timeout($timeout)
                ->withOptions(['stream' => true])
                ->get($baseUrl.'/version');
        } catch (ConnectionException $exception) {
            throw new TalosExtractionException(
                'TALOS_TIKA_UNAVAILABLE',
                'The document extraction service is unavailable. Retry when Tika is healthy.',
                $exception,
            );
        }

        if (! $response->successful()) {
            throw new TalosExtractionException(
                'TALOS_TIKA_VERSION_CHECK_FAILED',
                'The document extraction service version could not be verified.',
            );
        }

        $versionBody = $this->boundedBody(
            $response,
            4096,
            'TALOS_TIKA_VERSION_CHECK_FAILED',
            'The document extraction service version could not be verified.',
        );

        if (preg_match('/\b(\d+\.\d+\.\d+)\b/', $versionBody, $matches) !== 1
            || ! hash_equals($expectedVersion, $matches[1])
        ) {
            throw new TalosExtractionException(
                'TALOS_TIKA_VERSION_MISMATCH',
                'The document extraction service version does not match the configured security pin.',
            );
        }
    }

    private function configuredBaseUrl(): string
    {
        $value = config('talos-files.tika.url');
        if (! is_string($value) || trim($value) === '') {
            return $this->invalidConfiguration();
        }

        $url = rtrim(trim($value), '/');
        $parts = parse_url($url);
        if (! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || trim((string) $parts['host']) === ''
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || array_key_exists('query', $parts)
            || array_key_exists('fragment', $parts)
        ) {
            return $this->invalidConfiguration();
        }

        return $url;
    }

    private function configuredVersion(): string
    {
        $value = config('talos-files.tika.expected_version');
        if (! is_string($value) || preg_match('/^\d+\.\d+\.\d+$/', trim($value)) !== 1) {
            return $this->invalidConfiguration();
        }

        return trim($value);
    }

    private function positiveConfigInt(string $key): int
    {
        $value = config($key);
        if (! is_int($value) || $value <= 0) {
            return $this->invalidConfiguration();
        }

        return $value;
    }

    private function boundedBody(
        Response $response,
        int $maximumBytes,
        string $errorCode,
        string $safeMessage,
    ): string {
        $stream = $response->toPsrResponse()->getBody();
        if ($stream->isSeekable()) {
            $stream->rewind();
        }

        $body = '';
        while (! $stream->eof()) {
            $remaining = ($maximumBytes + 1) - strlen($body);
            if ($remaining <= 0) {
                throw new TalosExtractionException($errorCode, $safeMessage);
            }

            $chunk = $stream->read(min(65_536, $remaining));
            if ($chunk === '' && ! $stream->eof()) {
                throw new TalosExtractionException(
                    'TALOS_TIKA_RESPONSE_MALFORMED',
                    'The document extraction service returned an unreadable response.',
                );
            }
            $body .= $chunk;
        }

        if (strlen($body) > $maximumBytes) {
            throw new TalosExtractionException($errorCode, $safeMessage);
        }

        return $body;
    }

    private function invalidConfiguration(): never
    {
        throw new TalosExtractionException(
            'TALOS_TIKA_CONFIGURATION_INVALID',
            'The document extraction service is not configured correctly.',
        );
    }
}
