<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Ocr\TalosOcrClient;
use App\Services\FileIngestion\Ocr\TalosOcrReadiness;
use App\Services\FileIngestion\Ocr\TalosOcrResult;

final class FakeTalosOcrClient implements TalosOcrClient
{
    /** @var list<array{path:string,mime_type:string,source_sha256:string,owner_ref:string}> */
    public array $calls = [];

    public ?TalosExtractionException $failure = null;

    public function __construct(
        public bool $enabled = true,
        public ?TalosOcrResult $result = null,
    ) {}

    public function enabled(): bool
    {
        return $this->enabled;
    }

    public function readiness(): TalosOcrReadiness
    {
        return new TalosOcrReadiness(
            status: $this->enabled ? 'healthy' : 'disabled',
            detail: $this->enabled ? 'Fake OCR is ready.' : 'OCR is disabled.',
            blocking: $this->enabled,
        );
    }

    public function extract(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosOcrResult {
        $this->calls[] = [
            'path' => $absolutePath,
            'mime_type' => $mimeType,
            'source_sha256' => $sourceSha256,
            'owner_ref' => $ownerRef,
        ];

        if ($this->failure !== null) {
            throw $this->failure;
        }

        return $this->result ?? new TalosOcrResult(
            text: 'TALOS OCR sentinel',
            metadata: ['trust_level' => 'untrusted', 'pages' => []],
            modelRevision: 'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
        );
    }
}

