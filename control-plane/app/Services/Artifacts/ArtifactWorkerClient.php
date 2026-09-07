<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use JsonException;
use stdClass;
use Throwable;

final class ArtifactWorkerClient
{
    /** @var array<string, int> */
    private const LIMITS = [
        'max_output_bytes' => 25_000_000,
        'max_duration_ms' => 120_000,
        'max_sections' => 200,
        'max_rows' => 5_000,
        'max_slides' => 100,
        'max_input_pixels' => 16_000_000,
    ];

    public function readiness(): ArtifactWorkerReadiness
    {
        try {
            $response = $this->request()->get($this->url('/ready'));
        } catch (ConnectionException $exception) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_UNAVAILABLE',
                'Artifact worker readiness request failed.',
                503,
                previous: $exception,
            );
        }
        $this->assertResponseSize($response);
        if ($response->status() !== 200 || ! $this->isJson($response)) {
            throw ArtifactWorkerException::protocol('Artifact worker readiness is incompatible.');
        }

        return ArtifactWorkerReadiness::fromJson($response->body());
    }

    /**
     * @param  array<string, mixed>  $document
     */
    public function generate(
        string $requestId,
        string $format,
        string $filename,
        array $document,
    ): ArtifactWorkerResult {
        try {
            $response = $this->request()->post($this->url('/generate'), [
                'contract' => 'talos.artifact.request.v1',
                'request_id' => $requestId,
                'format' => $format,
                'filename' => $filename,
                'document' => $document,
                'limits' => self::LIMITS,
            ]);
        } catch (ConnectionException $exception) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_TRANSPORT_AMBIGUOUS',
                'Artifact worker transport failed after dispatch; TALOS will not retry automatically.',
                503,
                ambiguous: true,
                previous: $exception,
            );
        }

        $this->assertResponseSize($response);
        if ($this->isProblem($response)) {
            $this->throwProblem($response, $requestId);
        }
        if (! $this->isJson($response)) {
            throw ArtifactWorkerException::protocol();
        }

        $result = ArtifactWorkerResult::fromJson($response->body(), $requestId);
        if ($result->succeeded()) {
            if ($response->status() !== 200) {
                throw ArtifactWorkerException::protocol();
            }

            return $result;
        }

        throw new ArtifactWorkerException(
            (string) $result->errorCode,
            'Artifact worker could not complete generation.',
            $this->publicStatus($response->status()),
            ['worker_status' => $response->status()],
        );
    }

    public function cancel(string $requestId): ArtifactWorkerCancellation
    {
        try {
            $response = $this->request()->post($this->url('/cancel/'.rawurlencode($requestId)));
        } catch (ConnectionException $exception) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_CANCEL_AMBIGUOUS',
                'Artifact cancellation transport failed; reconcile request state before retrying.',
                503,
                ambiguous: true,
                previous: $exception,
            );
        }
        $this->assertResponseSize($response);
        if ($this->isProblem($response)) {
            $this->throwProblem($response, $requestId);
        }
        if ($response->status() !== 202 || ! $this->isJson($response)) {
            throw ArtifactWorkerException::protocol();
        }

        return ArtifactWorkerCancellation::fromJson($response->body(), $requestId);
    }

    private function request(): PendingRequest
    {
        $token = config('services.talos.artifact.worker_token');
        if (! is_string($token) || strlen($token) < 32 || preg_match('/[\x00-\x20\x7f]/', $token) === 1) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_CONFIG_INVALID',
                'Artifact worker credential is not configured safely.',
                503,
            );
        }

        return Http::acceptJson()
            ->withToken($token)
            ->connectTimeout($this->positiveConfig('connect_timeout_seconds', 3))
            ->timeout($this->positiveConfig('request_timeout_seconds', 130));
    }

    private function url(string $path): string
    {
        $url = config('services.talos.artifact.worker_url');
        if (! is_string($url) || trim($url) === '') {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_CONFIG_INVALID',
                'Artifact worker URL is not configured.',
                503,
            );
        }
        $parts = parse_url($url);
        if (! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || trim($parts['host']) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_CONFIG_INVALID',
                'Artifact worker URL is invalid.',
                503,
            );
        }

        return rtrim($url, '/').$path;
    }

    private function positiveConfig(string $key, int $fallback): int
    {
        $value = config('services.talos.artifact.'.$key, $fallback);

        return is_int($value) && $value > 0 ? $value : $fallback;
    }

    private function assertResponseSize(Response $response): void
    {
        $maximum = $this->positiveConfig('max_response_bytes', 35_000_000);
        if (strlen($response->body()) > $maximum) {
            throw new ArtifactWorkerException(
                'TALOS_ARTIFACT_WORKER_RESPONSE_TOO_LARGE',
                'Artifact worker response exceeds the configured byte limit.',
                502,
            );
        }
    }

    private function isJson(Response $response): bool
    {
        $type = strtolower(trim(explode(';', $response->header('Content-Type'))[0] ?? ''));

        return $type === 'application/json';
    }

    private function isProblem(Response $response): bool
    {
        $type = strtolower(trim(explode(';', $response->header('Content-Type'))[0] ?? ''));

        return $type === 'application/problem+json';
    }

    private function throwProblem(Response $response, string $expectedRequestId): never
    {
        try {
            $value = json_decode($response->body(), false, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ArtifactWorkerException::protocol();
        }
        if (! $value instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        $keys = array_keys(get_object_vars($value));
        sort($keys);
        $required = ['code', 'detail', 'status', 'title', 'type'];
        $allowed = [...$required, 'request_id'];
        if (array_diff($required, $keys) !== []
            || array_diff($keys, $allowed) !== []
            || ! is_string($value->type)
            || preg_match('/^urn:talos:artifact-worker:problem:[a-z0-9-]+$/', $value->type) !== 1
            || ! is_string($value->title)
            || trim($value->title) === ''
            || mb_strlen($value->title) > 120
            || ! is_int($value->status)
            || $value->status !== $response->status()
            || ! is_string($value->detail)
            || trim($value->detail) === ''
            || mb_strlen($value->detail) > 500
            || ! is_string($value->code)
            || preg_match('/^ARTIFACT_[A-Z0-9_]+$/', $value->code) !== 1
            || (property_exists($value, 'request_id')
                && (! is_string($value->request_id) || ! hash_equals($expectedRequestId, $value->request_id)))) {
            throw ArtifactWorkerException::protocol();
        }

        throw new ArtifactWorkerException(
            $value->code,
            'Artifact worker rejected the request.',
            $this->publicStatus($response->status()),
            ['worker_status' => $response->status()],
        );
    }

    private function publicStatus(int $workerStatus): int
    {
        return match (true) {
            $workerStatus === 400, $workerStatus === 415, $workerStatus === 422 => 422,
            $workerStatus === 404, $workerStatus === 409 => 409,
            $workerStatus === 429, $workerStatus === 503 => 503,
            default => 502,
        };
    }
}
