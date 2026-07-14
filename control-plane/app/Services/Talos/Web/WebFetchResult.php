<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use InvalidArgumentException;
use JsonSerializable;

final readonly class WebFetchResult implements JsonSerializable
{
    /** @param list<string> $redirectChain */
    private function __construct(
        public string $url,
        public string $contentType,
        public string $content,
        public int $bytes,
        public string $evidenceHash,
        public string $fetchedAt,
        public bool $untrusted,
        public array $redirectChain,
    ) {
        if ($url === '' || strlen($url) > 2048 || strlen($contentType) > 128 || strlen($content) > 10000000 || $bytes < 0) {
            throw new InvalidArgumentException('Web fetch result is outside its bounds.');
        }
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $evidenceHash) !== 1 || trim($fetchedAt) === '' || ! $untrusted) {
            throw new InvalidArgumentException('Web fetch provenance is invalid.');
        }
        foreach ($redirectChain as $redirect) {
            if (! is_string($redirect) || $redirect === '' || strlen($redirect) > 2048) {
                throw new InvalidArgumentException('Web fetch redirect provenance is invalid.');
            }
        }
    }

    /** @param list<string> $redirectChain */
    public static function fromFetchedBody(
        string $url,
        string $contentType,
        string $content,
        string $rawBody,
        string $fetchedAt,
        array $redirectChain,
    ): self {
        return new self(
            $url,
            $contentType,
            $content,
            strlen($rawBody),
            'sha256:'.hash('sha256', $rawBody),
            $fetchedAt,
            true,
            $redirectChain,
        );
    }

    /** @return array{url: string, content_type: string, content: string, bytes: int, evidence_hash: string, fetched_at: string, provenance: string, untrusted: bool, redirect_chain: list<string>} */
    public function toArray(): array
    {
        return [
            'url' => $this->url,
            'content_type' => $this->contentType,
            'content' => $this->content,
            'bytes' => $this->bytes,
            'evidence_hash' => $this->evidenceHash,
            'fetched_at' => $this->fetchedAt,
            'provenance' => 'untrusted_web_fetch',
            'untrusted' => $this->untrusted,
            'redirect_chain' => $this->redirectChain,
        ];
    }

    /** @return array{url: string, content_type: string, content: string, bytes: int, evidence_hash: string, fetched_at: string, provenance: string, untrusted: bool, redirect_chain: list<string>} */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
