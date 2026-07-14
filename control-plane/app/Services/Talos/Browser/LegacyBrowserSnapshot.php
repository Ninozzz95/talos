<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Services\Security\PublicHttpUrlPolicy;

final readonly class LegacyBrowserSnapshot
{
    public const MAX_NODES = 200;

    private const MAX_SNAPSHOT_ID_LENGTH = 128;

    private const MAX_URL_LENGTH = 2048;

    private const MAX_TITLE_LENGTH = 512;

    private const MAX_TEXT_DIGEST_LENGTH = 4000;

    private const MAX_REF_LENGTH = 128;

    private const MAX_ROLE_LENGTH = 64;

    private const MAX_NAME_LENGTH = 200;

    /** @param list<array<string, mixed>> $nodes */
    private function __construct(
        public string $snapshotId,
        public string $url,
        public string $title,
        public array $nodes,
        public string $textDigest,
    ) {}

    /** @param array<string, mixed> $payload */
    public static function fromWorker(array $payload): self
    {
        if (($payload['format'] ?? null) !== 'accessibility_refs_v1') {
            throw new \InvalidArgumentException('Snapshot format is invalid.');
        }

        $snapshotId = self::boundedString($payload, 'snapshotId', self::MAX_SNAPSHOT_ID_LENGTH, false);
        $url = self::safeHttpUrl($payload, 'url');
        $title = self::boundedString($payload, 'title', self::MAX_TITLE_LENGTH, true);
        $textDigest = self::boundedString($payload, 'textDigest', self::MAX_TEXT_DIGEST_LENGTH, true);
        $rawNodes = $payload['nodes'] ?? null;

        if (! is_array($rawNodes) || ! array_is_list($rawNodes) || count($rawNodes) > self::MAX_NODES) {
            throw new \InvalidArgumentException('Snapshot nodes are invalid.');
        }

        $nodes = [];
        $seenRefs = [];
        foreach ($rawNodes as $rawNode) {
            if (! is_array($rawNode)) {
                throw new \InvalidArgumentException('Snapshot node is invalid.');
            }

            $ref = self::boundedString($rawNode, 'ref', self::MAX_REF_LENGTH, false);
            if (preg_match('/\Ar[1-9]\d*\z/D', $ref) !== 1 || isset($seenRefs[$ref])) {
                throw new \InvalidArgumentException('Snapshot node ref is invalid.');
            }
            $seenRefs[$ref] = true;

            $node = [
                'ref' => $ref,
                'role' => self::boundedString($rawNode, 'role', self::MAX_ROLE_LENGTH, false),
                'name' => self::boundedString($rawNode, 'name', self::MAX_NAME_LENGTH, false),
                'visible' => self::boolean($rawNode, 'visible'),
            ];

            if (array_key_exists('href', $rawNode)) {
                $node['href'] = self::safeHttpUrl($rawNode, 'href');
            }

            if (array_key_exists('level', $rawNode)) {
                $level = $rawNode['level'];
                if (! is_int($level) || $level < 1 || $level > 6) {
                    throw new \InvalidArgumentException('Snapshot node level is invalid.');
                }
                $node['level'] = $level;
            }

            $nodes[] = $node;
        }

        return new self($snapshotId, $url, $title, $nodes, $textDigest);
    }

    /** @return array{snapshotId: string, format: string, url: string, title: string, nodes: list<array<string, mixed>>, textDigest: string} */
    public function toArray(): array
    {
        return [
            'snapshotId' => $this->snapshotId,
            'format' => 'accessibility_refs_v1',
            'url' => $this->url,
            'title' => $this->title,
            'nodes' => $this->nodes,
            'textDigest' => $this->textDigest,
        ];
    }

    /** @param array<string, mixed> $source */
    private static function boundedString(array $source, string $key, int $maxLength, bool $allowEmpty): string
    {
        $value = $source[$key] ?? null;
        if (! is_string($value)
            || (! $allowEmpty && trim($value) === '')
            || ! mb_check_encoding($value, 'UTF-8')
            || mb_strlen($value, 'UTF-8') > $maxLength) {
            throw new \InvalidArgumentException("Snapshot {$key} is invalid.");
        }

        return $value;
    }

    /** @param array<string, mixed> $source */
    private static function boolean(array $source, string $key): bool
    {
        $value = $source[$key] ?? null;
        if (! is_bool($value)) {
            throw new \InvalidArgumentException("Snapshot {$key} is invalid.");
        }

        return $value;
    }

    /** @param array<string, mixed> $source */
    private static function safeHttpUrl(array $source, string $key): string
    {
        $url = self::boundedString($source, $key, self::MAX_URL_LENGTH, false);
        $parts = parse_url($url);
        $policy = (new PublicHttpUrlPolicy)->inspect($url, resolveHostname: false);

        if (filter_var($url, FILTER_VALIDATE_URL) === false
            || ! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || $parts['host'] === ''
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || ! $policy['allowed']) {
            throw new \InvalidArgumentException("Snapshot {$key} is unsafe.");
        }

        return $url;
    }
}
