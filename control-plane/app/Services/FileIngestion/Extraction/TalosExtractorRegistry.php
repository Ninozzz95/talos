<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

use App\Exceptions\TalosExtractionException;

final class TalosExtractorRegistry
{
    public function __construct(
        private readonly PlainTextExtractor $plainText,
        private readonly TikaServerExtractor $tika,
    ) {}

    public function forMime(string $mimeType): TalosTextExtractor
    {
        foreach ([$this->plainText, $this->tika] as $extractor) {
            if ($extractor->supports($mimeType)) {
                return $extractor;
            }
        }

        throw new TalosExtractionException(
            'TALOS_FILE_EXTRACTOR_UNSUPPORTED',
            'No deterministic extractor is configured for this file type.',
        );
    }
}
