<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Ocr;

use App\Exceptions\TalosExtractionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use JsonException;
use stdClass;
use Throwable;

final class HttpDeepSeekOcrClient implements TalosOcrClient
{
    /** @var list<string> */
    private const MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

    /** @var array<string, array{status: int, retryable: bool, message: string}> */
    private const WORKER_FAULTS = [
        'TALOS_OCR_REQUEST_TOO_LARGE' => [
            'status' => 413,
            'retryable' => false,
            'message' => 'The OCR request exceeds the configured size limit.',
        ],
        'TALOS_OCR_REQUEST_INVALID' => [
            'status' => 422,
            'retryable' => false,
            'message' => 'The OCR request was rejected as invalid.',
        ],
        'TALOS_OCR_SOURCE_LIMIT_EXCEEDED' => [
            'status' => 413,
            'retryable' => false,
            'message' => 'The OCR source exceeds a configured safety limit.',
        ],
        'TALOS_OCR_SOURCE_INVALID' => [
            'status' => 422,
            'retryable' => false,
            'message' => 'The OCR source is invalid or unsupported.',
        ],
        'TALOS_OCR_RUNTIME_UNAVAILABLE' => [
            'status' => 503,
            'retryable' => true,
            'message' => 'The OCR runtime is unavailable. Retry when it is healthy.',
        ],
        'TALOS_OCR_RUNTIME_DRIFT' => [
            'status' => 503,
            'retryable' => false,
            'message' => 'The OCR runtime does not match the configured version contract.',
        ],
        'TALOS_OCR_RUNTIME_RESPONSE_INVALID' => [
            'status' => 502,
            'retryable' => false,
            'message' => 'The OCR runtime returned an invalid response.',
        ],
        'TALOS_OCR_RUNTIME_OUTPUT_TRUNCATED' => [
            'status' => 502,
            'retryable' => false,
            'message' => 'The OCR runtime output reached its configured limit.',
        ],
        'TALOS_OCR_REQUEST_TIMEOUT' => [
            'status' => 504,
            'retryable' => true,
            'message' => 'The OCR request exceeded its processing deadline. Retry when capacity is available.',
        ],
    ];

    public function enabled(): bool
    {
        return config('talos-files.ocr.enabled') === true;
    }

    public function readiness(): TalosOcrReadiness
    {
        if (! $this->enabled()) {
            return new TalosOcrReadiness('disabled', 'OCR is disabled.', false);
        }

        $configuration = $this->configuration();
        $response = $this->send(
            static fn (PendingRequest $request): Response => $request->get($configuration['url'].'/ready'),
            $configuration,
        );
        $root = $this->decodeResponse($response, $configuration['max_response_bytes']);
        $this->assertExactObject($root, ['data']);
        $data = $root->data ?? null;
        if (! $data instanceof stdClass) {
            $this->malformed();
        }
        $this->assertExactObject($data, [
            'protocol', 'status', 'model', 'model_revision', 'served_model',
            'runtime', 'runtime_version', 'pdf_renderer', 'pdf_renderer_version',
            'image_renderer', 'image_renderer_version',
        ]);
        if (($data->status ?? null) !== 'ready' || ($data->runtime ?? null) !== 'vllm') {
            $this->malformed();
        }
        $this->assertPinnedProvenance($data, $configuration, includeRenderers: true);

        return new TalosOcrReadiness(
            status: 'healthy',
            detail: 'Pinned DeepSeek OCR-2 runtime is ready.',
            blocking: true,
        );
    }

    public function extract(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosOcrResult {
        $configuration = $this->configuration();
        $normalizedMime = strtolower(trim($mimeType));
        if (! in_array($normalizedMime, self::MIME_TYPES, true)
            || preg_match('/^[0-9a-f]{64}$/', $sourceSha256) !== 1
            || ! Str::isUuid($ownerRef)
            || ! is_file($absolutePath)
            || ! is_readable($absolutePath)
        ) {
            throw new TalosExtractionException(
                'TALOS_OCR_REQUEST_INVALID',
                'The OCR request could not be constructed safely.',
            );
        }

        $bytes = file_get_contents($absolutePath);
        if (! is_string($bytes) || $bytes === '') {
            throw new TalosExtractionException(
                'TALOS_OCR_SOURCE_READ_FAILED',
                'The quarantined file could not be read for OCR.',
            );
        }
        $observedHash = hash('sha256', $bytes);
        $postReadHash = hash_file('sha256', $absolutePath);
        if (! is_string($postReadHash)
            || ! hash_equals($sourceSha256, $observedHash)
            || ! hash_equals($sourceSha256, $postReadHash)
        ) {
            throw new TalosExtractionException(
                'TALOS_OCR_SOURCE_HASH_MISMATCH',
                'The quarantined file changed before OCR and was not processed.',
            );
        }

        $requestId = (string) Str::uuid();
        $payload = [
            'protocol' => $configuration['protocol'],
            'request_id' => $requestId,
            'owner_ref' => $ownerRef,
            'input' => [
                'mime_type' => $normalizedMime,
                'sha256' => $sourceSha256,
                'bytes_base64' => base64_encode($bytes),
            ],
        ];
        try {
            $encoded = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        } catch (JsonException $exception) {
            throw new TalosExtractionException(
                'TALOS_OCR_REQUEST_INVALID',
                'The OCR request could not be constructed safely.',
                $exception,
            );
        }

        $response = $this->send(
            static fn (PendingRequest $request): Response => $request
                ->withBody($encoded, 'application/json')
                ->post($configuration['url'].'/v1/ocr'),
            $configuration,
        );
        $root = $this->decodeResponse($response, $configuration['max_response_bytes']);

        return $this->parseExtraction(
            $root,
            $configuration,
            $normalizedMime,
            $requestId,
            $ownerRef,
            $sourceSha256,
        );
    }

    /**
     * @param  array<string, mixed>  $configuration
     */
    private function send(callable $operation, array $configuration): Response
    {
        try {
            $response = $operation(
                Http::acceptJson()
                    ->withHeaders(['X-Talos-Ocr-Token' => $configuration['token']])
                    ->connectTimeout(min(3, $configuration['timeout_seconds']))
                    ->timeout($configuration['timeout_seconds'])
                    ->withOptions([
                        'stream' => true,
                        'allow_redirects' => false,
                        'proxy' => '',
                    ]),
            );
        } catch (Throwable $exception) {
            throw new TalosExtractionException(
                'TALOS_OCR_UNAVAILABLE',
                'The OCR service is unavailable. Retry when the OCR runtime is healthy.',
                $exception,
            );
        }

        if (! $response->successful()) {
            $this->throwWorkerFault($response, $configuration['max_response_bytes']);
        }

        return $response;
    }

    private function decodeResponse(Response $response, int $maximumBytes): stdClass
    {
        $body = $this->boundedBody($response, $maximumBytes);
        try {
            $root = json_decode($body, false, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new TalosExtractionException(
                'TALOS_OCR_RESPONSE_MALFORMED',
                'The OCR service returned an invalid response.',
                $exception,
            );
        }
        if (! $root instanceof stdClass) {
            $this->malformed();
        }

        return $root;
    }

    private function boundedBody(Response $response, int $maximumBytes): string
    {
        try {
            $stream = $response->toPsrResponse()->getBody();
            if ($stream->isSeekable()) {
                $stream->rewind();
            }
            $body = '';
            while (! $stream->eof()) {
                $remaining = ($maximumBytes + 1) - strlen($body);
                if ($remaining <= 0) {
                    $this->responseTooLarge();
                }
                $chunk = $stream->read(min(65_536, $remaining));
                if ($chunk === '' && ! $stream->eof()) {
                    $this->malformed();
                }
                $body .= $chunk;
            }
            if (strlen($body) > $maximumBytes) {
                $this->responseTooLarge();
            }
        } catch (TalosExtractionException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            $this->unavailable($exception);
        }

        return $body;
    }

    private function throwWorkerFault(Response $response, int $maximumBytes): never
    {
        try {
            $root = json_decode(
                $this->boundedBody($response, $maximumBytes),
                false,
                16,
                JSON_THROW_ON_ERROR,
            );
        } catch (JsonException) {
            $this->unavailable();
        }

        if (! $root instanceof stdClass || ! $this->hasExactProperties($root, ['error'])) {
            $this->unavailable();
        }
        $error = $root->error ?? null;
        if (! $error instanceof stdClass
            || ! $this->hasExactProperties($error, ['code', 'message', 'retryable'])
            || ! is_string($error->code ?? null)
            || ! is_string($error->message ?? null)
            || ! is_bool($error->retryable ?? null)
        ) {
            $this->unavailable();
        }

        $fault = self::WORKER_FAULTS[$error->code] ?? null;
        if ($fault === null
            || $response->status() !== $fault['status']
            || $error->retryable !== $fault['retryable']
        ) {
            $this->unavailable();
        }

        throw new TalosExtractionException($error->code, $fault['message']);
    }

    /**
     * @param  array<string, mixed>  $configuration
     */
    private function parseExtraction(
        stdClass $root,
        array $configuration,
        string $mimeType,
        string $requestId,
        string $ownerRef,
        string $sourceSha256,
    ): TalosOcrResult {
        $this->assertExactObject($root, ['data']);
        $data = $root->data ?? null;
        if (! $data instanceof stdClass) {
            $this->malformed();
        }
        $this->assertExactObject($data, [
            'protocol', 'request_id', 'owner_ref', 'source_sha256', 'text',
            'text_sha256', 'pages', 'provenance', 'warnings',
        ]);
        foreach ([
            'protocol' => $configuration['protocol'],
            'request_id' => $requestId,
            'owner_ref' => $ownerRef,
            'source_sha256' => $sourceSha256,
        ] as $property => $expected) {
            $actual = $data->{$property} ?? null;
            if (! is_string($actual) || ! hash_equals((string) $expected, $actual)) {
                $this->mismatch();
            }
        }
        $text = $data->text ?? null;
        $textHash = $data->text_sha256 ?? null;
        if (! is_string($text) || trim($text) === '' || preg_match('//u', $text) !== 1
            || ! is_string($textHash) || ! hash_equals(hash('sha256', $text), $textHash)
        ) {
            $this->mismatch();
        }
        $maximumTextBytes = config('talos-files.tika.max_extracted_bytes');
        if (! is_int($maximumTextBytes) || $maximumTextBytes <= 0) {
            $this->configurationInvalid();
        }
        if (strlen($text) > $maximumTextBytes) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTED_TEXT_TOO_LARGE',
                'The extracted text exceeds the configured size limit.',
            );
        }

        $pages = $this->parsePages($data->pages ?? null);
        $pageText = implode("\n\n", array_column($pages, 'text'));
        if (! hash_equals($pageText, $text)) {
            $this->mismatch();
        }
        $warnings = $this->parseWarnings($data->warnings ?? null);
        $provenance = $data->provenance ?? null;
        if (! $provenance instanceof stdClass) {
            $this->malformed();
        }
        $this->assertExactObject($provenance, [
            'model', 'model_revision', 'served_model', 'runtime',
            'runtime_version', 'renderer', 'renderer_version',
        ]);
        $this->assertPinnedProvenance($provenance, $configuration, includeRenderers: false);
        $expectedRenderer = $mimeType === 'application/pdf' ? 'pypdfium2' : 'pillow';
        $expectedRendererVersion = $mimeType === 'application/pdf'
            ? $configuration['expected_pdf_renderer_version']
            : $configuration['expected_image_renderer_version'];
        if (($provenance->renderer ?? null) !== $expectedRenderer
            || ($provenance->renderer_version ?? null) !== $expectedRendererVersion
        ) {
            $this->runtimeDrift();
        }

        return new TalosOcrResult(
            text: $text,
            metadata: [
                'trust_level' => 'untrusted',
                'protocol' => $configuration['protocol'],
                'source_sha256' => $sourceSha256,
                'pages' => $pages,
                'provenance' => [
                    'model' => $provenance->model,
                    'model_revision' => $provenance->model_revision,
                    'served_model' => $provenance->served_model,
                    'runtime' => $provenance->runtime,
                    'runtime_version' => $provenance->runtime_version,
                    'renderer' => $provenance->renderer,
                    'renderer_version' => $provenance->renderer_version,
                ],
                'warnings' => $warnings,
            ],
            modelRevision: $provenance->model_revision,
        );
    }

    /** @return list<array<string, mixed>> */
    private function parsePages(mixed $candidate): array
    {
        if (! is_array($candidate) || ! array_is_list($candidate) || $candidate === [] || count($candidate) > 20) {
            $this->malformed();
        }
        $pages = [];
        foreach ($candidate as $offset => $page) {
            if (! $page instanceof stdClass) {
                $this->malformed();
            }
            $this->assertExactObject($page, [
                'index', 'width', 'height', 'image_sha256', 'text', 'text_sha256',
                'latency_ms', 'usage', 'warnings',
            ]);
            $usage = $page->usage ?? null;
            if (! $usage instanceof stdClass) {
                $this->malformed();
            }
            $this->assertExactObject($usage, ['prompt_tokens', 'completion_tokens']);
            $pageText = $page->text ?? null;
            if (($page->index ?? null) !== $offset + 1
                || ! is_int($page->width ?? null) || $page->width <= 0
                || ! is_int($page->height ?? null) || $page->height <= 0
                || ! $this->isSha256($page->image_sha256 ?? null)
                || ! is_string($pageText) || trim($pageText) === ''
                || ! $this->isSha256($page->text_sha256 ?? null)
                || ! hash_equals(hash('sha256', $pageText), $page->text_sha256)
                || ! is_int($page->latency_ms ?? null) || $page->latency_ms < 0
                || ! is_int($usage->prompt_tokens ?? null) || $usage->prompt_tokens < 0
                || ! is_int($usage->completion_tokens ?? null) || $usage->completion_tokens < 0
            ) {
                $this->malformed();
            }
            $pages[] = [
                'index' => $page->index,
                'width' => $page->width,
                'height' => $page->height,
                'image_sha256' => $page->image_sha256,
                'text' => $pageText,
                'text_sha256' => $page->text_sha256,
                'latency_ms' => $page->latency_ms,
                'usage' => [
                    'prompt_tokens' => $usage->prompt_tokens,
                    'completion_tokens' => $usage->completion_tokens,
                ],
                'warnings' => $this->parseWarnings($page->warnings ?? null),
            ];
        }

        return $pages;
    }

    /** @return list<string> */
    private function parseWarnings(mixed $candidate): array
    {
        if (! is_array($candidate) || ! array_is_list($candidate) || count($candidate) > 100) {
            $this->malformed();
        }
        foreach ($candidate as $warning) {
            if (! is_string($warning) || strlen($warning) > 512) {
                $this->malformed();
            }
        }

        return $candidate;
    }

    /**
     * @param  array<string, mixed>  $configuration
     */
    private function assertPinnedProvenance(stdClass $data, array $configuration, bool $includeRenderers): void
    {
        $expected = [
            'model' => $configuration['expected_model'],
            'model_revision' => $configuration['expected_model_revision'],
            'served_model' => $configuration['expected_served_model'],
            'runtime' => 'vllm',
            'runtime_version' => $configuration['expected_runtime_version'],
        ];
        if ($includeRenderers) {
            $expected['protocol'] = $configuration['protocol'];
            $expected['pdf_renderer'] = 'pypdfium2';
            $expected['pdf_renderer_version'] = $configuration['expected_pdf_renderer_version'];
            $expected['image_renderer'] = 'pillow';
            $expected['image_renderer_version'] = $configuration['expected_image_renderer_version'];
        }
        foreach ($expected as $property => $value) {
            if (($data->{$property} ?? null) !== $value) {
                $this->runtimeDrift();
            }
        }
    }

    /** @param list<string> $expected */
    private function assertExactObject(stdClass $object, array $expected): void
    {
        if (! $this->hasExactProperties($object, $expected)) {
            $this->malformed();
        }
    }

    /** @param list<string> $expected */
    private function hasExactProperties(stdClass $object, array $expected): bool
    {
        $actual = array_keys(get_object_vars($object));
        sort($actual);
        sort($expected);

        return $actual === $expected;
    }

    private function isSha256(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[0-9a-f]{64}$/', $value) === 1;
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        $configuration = config('talos-files.ocr');
        if (! is_array($configuration)) {
            $this->configurationInvalid();
        }
        $url = is_string($configuration['url'] ?? null) ? rtrim(trim($configuration['url']), '/') : '';
        $parts = parse_url($url);
        $token = $configuration['token'] ?? null;
        $protocol = $configuration['protocol'] ?? null;
        $revision = $configuration['expected_model_revision'] ?? null;
        $timeout = $configuration['timeout_seconds'] ?? null;
        $maximumBytes = $configuration['max_response_bytes'] ?? null;
        if ($configuration['enabled'] !== true
            || ! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null) || trim($parts['host']) === ''
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || ! is_string($token) || preg_match('/^[0-9a-fA-F]{64,}$/', $token) !== 1
            || $protocol !== 'talos.ocr.worker.v1'
            || $configuration['expected_model'] !== 'deepseek-ai/DeepSeek-OCR-2'
            || ! is_string($revision) || preg_match('/^[0-9a-f]{40}$/', $revision) !== 1
            || $configuration['expected_served_model'] !== 'deepseek-ai/DeepSeek-OCR-2@'.$revision
            || $configuration['expected_runtime_version'] !== '0.25.1'
            || $configuration['expected_pdf_renderer_version'] !== '5.12.1'
            || $configuration['expected_image_renderer_version'] !== '12.3.0'
            || ! is_int($timeout) || $timeout <= 0
            || ! is_int($maximumBytes) || $maximumBytes <= 0
        ) {
            $this->configurationInvalid();
        }
        $configuration['url'] = $url;

        return $configuration;
    }

    private function malformed(): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_RESPONSE_MALFORMED',
            'The OCR service returned an invalid response.',
        );
    }

    private function mismatch(): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_RESPONSE_MISMATCH',
            'The OCR response does not match the requested source.',
        );
    }

    private function runtimeDrift(): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_RUNTIME_DRIFT',
            'The OCR runtime does not match the configured version contract.',
        );
    }

    private function responseTooLarge(): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_RESPONSE_TOO_LARGE',
            'The OCR response exceeds the configured size limit.',
        );
    }

    private function configurationInvalid(): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_CONFIGURATION_INVALID',
            'The OCR service is not configured correctly.',
        );
    }

    private function unavailable(?Throwable $previous = null): never
    {
        throw new TalosExtractionException(
            'TALOS_OCR_UNAVAILABLE',
            'The OCR service is unavailable. Retry when the OCR runtime is healthy.',
            $previous,
        );
    }
}
