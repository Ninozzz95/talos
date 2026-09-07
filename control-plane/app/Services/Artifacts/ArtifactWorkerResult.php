<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use JsonException;
use stdClass;

final readonly class ArtifactWorkerResult
{
    /** @var array<string, string> */
    private const MIME_BY_FORMAT = [
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pdf' => 'application/pdf',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'thumbnail' => 'image/png',
    ];

    private function __construct(
        public string $requestId,
        public string $status,
        public ?string $format,
        public ?string $mimeType,
        public ?string $sha256,
        public ?int $byteSize,
        public ?string $bytes,
        public ?string $detectedMime,
        public ?bool $reopened,
        public ?string $errorCode,
        public ?string $errorMessage,
    ) {}

    public static function fromJson(string $json, string $expectedRequestId): self
    {
        try {
            $value = json_decode($json, false, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ArtifactWorkerException::protocol('Artifact worker generation returned invalid JSON.');
        }
        if (! $value instanceof stdClass
            || ! property_exists($value, 'status')
            || ! is_string($value->status)) {
            throw ArtifactWorkerException::protocol();
        }

        return match ($value->status) {
            'succeeded' => self::success($value, $expectedRequestId),
            'failed' => self::failure($value, $expectedRequestId),
            default => throw ArtifactWorkerException::protocol(),
        };
    }

    public function succeeded(): bool
    {
        return $this->status === 'succeeded';
    }

    private static function success(stdClass $value, string $expectedRequestId): self
    {
        self::assertExactKeys($value, [
            'byte_size',
            'contract',
            'data_base64',
            'format',
            'mime_type',
            'request_id',
            'sha256',
            'status',
            'validation',
        ]);
        if ($value->contract !== 'talos.artifact.response.v1'
            || ! is_string($value->request_id)
            || ! hash_equals($expectedRequestId, $value->request_id)
            || ! is_string($value->format)
            || ! array_key_exists($value->format, self::MIME_BY_FORMAT)
            || ! is_string($value->mime_type)
            || $value->mime_type !== self::MIME_BY_FORMAT[$value->format]
            || ! is_string($value->sha256)
            || preg_match('/^[a-f0-9]{64}$/', $value->sha256) !== 1
            || ! is_int($value->byte_size)
            || $value->byte_size < 1
            || $value->byte_size > 25_000_000
            || ! is_string($value->data_base64)
            || $value->data_base64 === ''
            || ! $value->validation instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        self::assertExactKeys($value->validation, ['detected_mime', 'reopened']);
        if (! is_string($value->validation->detected_mime)
            || $value->validation->detected_mime !== $value->mime_type
            || ! is_bool($value->validation->reopened)
            || $value->validation->reopened !== true) {
            throw ArtifactWorkerException::protocol();
        }

        $bytes = base64_decode($value->data_base64, true);
        if (! is_string($bytes)
            || base64_encode($bytes) !== $value->data_base64
            || strlen($bytes) !== $value->byte_size
            || ! hash_equals($value->sha256, hash('sha256', $bytes))) {
            throw ArtifactWorkerException::protocol();
        }

        return new self(
            $value->request_id,
            'succeeded',
            $value->format,
            $value->mime_type,
            $value->sha256,
            $value->byte_size,
            $bytes,
            $value->validation->detected_mime,
            $value->validation->reopened,
            null,
            null,
        );
    }

    private static function failure(stdClass $value, string $expectedRequestId): self
    {
        self::assertExactKeys($value, ['contract', 'error', 'request_id', 'status']);
        if ($value->contract !== 'talos.artifact.response.v1'
            || ! is_string($value->request_id)
            || ! hash_equals($expectedRequestId, $value->request_id)
            || ! $value->error instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        self::assertExactKeys($value->error, ['code', 'message']);
        if (! is_string($value->error->code)
            || preg_match('/^ARTIFACT_[A-Z0-9_]+$/', $value->error->code) !== 1
            || ! is_string($value->error->message)
            || trim($value->error->message) === ''
            || mb_strlen($value->error->message) > 500) {
            throw ArtifactWorkerException::protocol();
        }

        return new self(
            $value->request_id,
            'failed',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            $value->error->code,
            $value->error->message,
        );
    }

    /** @param list<string> $expected */
    private static function assertExactKeys(stdClass $value, array $expected): void
    {
        $actual = array_keys(get_object_vars($value));
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw ArtifactWorkerException::protocol();
        }
    }
}
