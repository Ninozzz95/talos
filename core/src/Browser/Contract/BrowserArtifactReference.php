<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserArtifactReference
{
    private function __construct(
        public string $artifactId,
        public BrowserArtifactKind $kind,
        public string $mime,
        public string $sha256,
        public int $byteSize,
        public ?int $width,
        public ?int $height,
        public BrowserRedactionStatus $redactionStatus,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-artifact-reference', 'Browser artifact reference'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value));
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::ARTIFACT,
            'artifact_id' => $this->artifactId,
            'kind' => $this->kind->value,
            'mime' => $this->mime,
            'sha256' => $this->sha256,
            'byte_size' => $this->byteSize,
            'width' => $this->width,
            'height' => $this->height,
            'redaction_status' => $this->redactionStatus->value,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserArtifactKind $kind */
        $kind = BrowserContractGuard::enum($value['kind'], BrowserArtifactKind::class, 'Browser artifact kind');
        /** @var BrowserRedactionStatus $redaction */
        $redaction = BrowserContractGuard::enum($value['redaction_status'], BrowserRedactionStatus::class, 'Browser artifact redaction status');
        BrowserContractGuard::require(
            ($value['width'] === null && $value['height'] === null) || ($value['width'] !== null && $value['height'] !== null),
            'Browser artifact dimensions must both be present or both be null.',
        );

        return new self(
            $value['artifact_id'],
            $kind,
            $value['mime'],
            $value['sha256'],
            $value['byte_size'],
            $value['width'],
            $value['height'],
            $redaction,
        );
    }
}
