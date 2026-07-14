<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use InvalidArgumentException;
use JsonSerializable;

final readonly class WebSearchResult implements JsonSerializable
{
    private function __construct(
        public string $title,
        public string $url,
        public string $snippet,
        public string $source,
        public int $rank,
        public string $timestamp,
        public string $evidenceHash,
        public string $provenance = 'untrusted',
        public bool $untrusted = true,
    ) {
        self::bounded($title, 'title', 512, requireValue: true);
        self::bounded($url, 'url', 2048, requireValue: true);
        self::bounded($snippet, 'snippet', 4096);
        self::bounded($source, 'source', 128, requireValue: true);
        self::bounded($timestamp, 'timestamp', 64, requireValue: true);
        if ($rank < 1) {
            throw new InvalidArgumentException('Search result rank must be positive.');
        }
        if (preg_match('/\Asha256:[a-f0-9]{64}\z/', $evidenceHash) !== 1) {
            throw new InvalidArgumentException('Search result evidence hash must be a lowercase SHA-256 digest.');
        }
        if ($provenance !== 'untrusted' || ! $untrusted) {
            throw new InvalidArgumentException('External search results must remain untrusted.');
        }
    }

    public static function fromFields(
        string $title,
        string $url,
        string $snippet,
        string $source,
        int $rank,
        string $timestamp,
    ): self {
        $canonicalEvidence = json_encode([
            'title' => $title,
            'url' => $url,
            'snippet' => $snippet,
            'source' => $source,
            'rank' => $rank,
            'timestamp' => $timestamp,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        return new self(
            $title,
            $url,
            $snippet,
            $source,
            $rank,
            $timestamp,
            'sha256:'.hash('sha256', $canonicalEvidence),
        );
    }

    /** @return array{title: string, url: string, snippet: string, source: string, rank: int, timestamp: string, evidence_hash: string, provenance: string, untrusted: bool} */
    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'url' => $this->url,
            'snippet' => $this->snippet,
            'source' => $this->source,
            'rank' => $this->rank,
            'timestamp' => $this->timestamp,
            'evidence_hash' => $this->evidenceHash,
            'provenance' => $this->provenance,
            'untrusted' => $this->untrusted,
        ];
    }

    /** @return array{title: string, url: string, snippet: string, source: string, rank: int, timestamp: string, evidence_hash: string, provenance: string, untrusted: bool} */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    private static function bounded(string $value, string $field, int $maxBytes, bool $requireValue = false): void
    {
        if (strlen($value) > $maxBytes || ($requireValue && trim($value) === '')) {
            throw new InvalidArgumentException(sprintf('Search result %s is outside its bound.', $field));
        }
    }
}
