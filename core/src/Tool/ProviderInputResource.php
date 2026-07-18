<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProviderInputResource
{
    public const SCHEMA_VERSION = 'provider_input_resource.v1';
    public const KIND_IMAGE = 'image';
    public const KIND_DOCUMENT = 'document';
    public const MAX_BYTES = 10485760;

    public int $sizeBytes;
    public string $sha256;

    private function __construct(
        public string $resourceId,
        public string $kind,
        public string $filename,
        public string $mediaType,
        private string $bytes,
    ) {
        $this->sizeBytes = strlen($bytes);
        $this->sha256 = 'sha256:'.hash('sha256', $bytes);
    }

    public static function fromBytes(
        string $resourceId,
        string $kind,
        string $filename,
        string $mediaType,
        string $bytes,
    ): self {
        ToolContractGuard::nonEmptyString($resourceId, 'Provider input resource ID', 128);
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $resourceId) !== 1) {
            throw new InvalidArgumentException('Provider input resource ID contains unsupported characters.');
        }
        if (! in_array($kind, [self::KIND_IMAGE, self::KIND_DOCUMENT], true)) {
            throw new InvalidArgumentException('Provider input resource kind must be image or document.');
        }
        ToolContractGuard::nonEmptyString($filename, 'Provider input resource filename', 255);
        if (in_array($filename, ['.', '..'], true)
            || preg_match('/[\x00-\x1f\x7f\x{2028}\x{2029}\/\\\\]/u', $filename) !== 0) {
            throw new InvalidArgumentException('Provider input resource filename must be a safe basename.');
        }
        ToolContractGuard::nonEmptyString($mediaType, 'Provider input resource media type', 255);
        if ($mediaType !== strtolower($mediaType)
            || preg_match('/^[a-z0-9][a-z0-9!#$&^_.+\-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+\-]{0,126}$/D', $mediaType) !== 1) {
            throw new InvalidArgumentException('Provider input resource media type must be a canonical lower-case MIME type.');
        }
        if (($kind === self::KIND_IMAGE) !== str_starts_with($mediaType, 'image/')) {
            throw new InvalidArgumentException('Provider input resource kind does not match its media type.');
        }
        $size = strlen($bytes);
        if ($size < 1 || $size > self::MAX_BYTES) {
            throw new InvalidArgumentException(sprintf('Provider input resource bytes must contain between 1 and %d bytes.', self::MAX_BYTES));
        }

        return new self($resourceId, $kind, $filename, $mediaType, $bytes);
    }

    public function base64Data(): string
    {
        return base64_encode($this->bytes);
    }

    public function dataUri(): string
    {
        return sprintf('data:%s;base64,%s', $this->mediaType, $this->base64Data());
    }

    /** @return array<string, int|string> */
    public function toAuditArray(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'resource_id' => $this->resourceId,
            'kind' => $this->kind,
            'filename' => $this->filename,
            'media_type' => $this->mediaType,
            'size_bytes' => $this->sizeBytes,
            'sha256' => $this->sha256,
        ];
    }

    public function isImage(): bool
    {
        return $this->kind === self::KIND_IMAGE;
    }

    public function isDocument(): bool
    {
        return $this->kind === self::KIND_DOCUMENT;
    }
}
