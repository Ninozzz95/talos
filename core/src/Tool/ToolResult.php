<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ToolResult implements \JsonSerializable
{
    public const SCHEMA_VERSION = 'talos_tool_result_v1';

    /**
     * @param list<array<string, mixed>> $content
     * @param array<string, mixed>|null $structuredContent
     * @param list<array<string, mixed>> $evidence
     */
    public function __construct(
        public string $toolUseId,
        public bool $isError,
        public array $content,
        public ?array $structuredContent,
        public array $evidence,
    ) {
        ToolContractGuard::nonEmptyString($toolUseId, 'Tool result use ID', 256);
        self::content($content);
        if ($structuredContent !== null) {
            ToolContractGuard::objectArray($structuredContent, 'Tool result structuredContent');
            ToolContractGuard::jsonValue($structuredContent, 'Tool result structuredContent');
        }
        self::evidence($evidence);
        self::assertArtifactReferences($content, $structuredContent, $evidence);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value, string $expectedToolUseId): self
    {
        ToolContractGuard::exactKeys(
            $value,
            ['schema_version', 'tool_use_id', 'isError', 'content', 'structuredContent', 'evidence'],
            [],
            'Tool result',
        );
        if (($value['schema_version'] ?? null) !== self::SCHEMA_VERSION) {
            throw new InvalidArgumentException('Tool result schema_version is unsupported.');
        }

        $toolUseId = ToolContractGuard::nonEmptyString($value['tool_use_id'], 'Tool result use ID', 256);
        ToolContractGuard::nonEmptyString($expectedToolUseId, 'Expected provider tool call ID', 256);
        if ($toolUseId !== $expectedToolUseId) {
            throw new InvalidArgumentException('Tool result use ID does not match the provider call ID.');
        }

        $content = ToolContractGuard::listArray($value['content'], 'Tool result content');
        $structuredContent = $value['structuredContent'] === null
            ? null
            : ToolContractGuard::objectArray($value['structuredContent'], 'Tool result structuredContent');
        $evidence = ToolContractGuard::listArray($value['evidence'], 'Tool result evidence');

        return new self(
            toolUseId: $toolUseId,
            isError: ToolContractGuard::boolean($value['isError'], 'Tool result isError'),
            content: $content,
            structuredContent: $structuredContent,
            evidence: $evidence,
        );
    }

    public static function fromJson(string $json, string $expectedToolUseId): self
    {
        return self::fromArray(ToolWireDecoder::result($json), $expectedToolUseId);
    }

    public static function error(string $toolUseId, string $code, string $message): self
    {
        return new self(
            toolUseId: ToolContractGuard::nonEmptyString($toolUseId, 'Tool result use ID', 256),
            isError: true,
            content: [[
                'type' => 'text',
                'text' => ToolContractGuard::nonEmptyString($message, 'Tool error message', 4096),
            ]],
            structuredContent: [
                'code' => ToolContractGuard::nonEmptyString($code, 'Tool error code', 128),
                'message' => $message,
            ],
            evidence: [],
        );
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'tool_use_id' => $this->toolUseId,
            'isError' => $this->isError,
            'content' => $this->content,
            'structuredContent' => $this->structuredContent,
            'evidence' => $this->evidence,
        ];
    }

    /** @return array<string, mixed> */
    public function toWireArray(): array
    {
        return [
            ...$this->toArray(),
            'content' => self::serializedContent($this->content),
            'structuredContent' => $this->structuredContent === null
                ? null
                : ToolContractGuard::canonicalObjectArray($this->structuredContent),
        ];
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return $this->toWireArray();
    }

    /** @return array<string, mixed> */
    public function toRedactedArray(): array
    {
        return ToolContractGuard::redact($this->toWireArray());
    }

    /** @param list<array<string, mixed>> $content */
    private static function content(array $content): void
    {
        ToolContractGuard::boundedListArray($content, 'Tool result content', 64);
        foreach ($content as $index => $block) {
            $block = ToolContractGuard::objectArray($block, sprintf('Tool result content block %d', $index));
            $type = ToolContractGuard::nonEmptyString($block['type'] ?? null, sprintf('Tool result content block %d type', $index), 64);

            match ($type) {
                'text' => self::textBlock($block, $index),
                'image' => self::imageBlock($block, $index),
                'audio' => self::audioBlock($block, $index),
                'resource_link' => self::resourceLinkBlock($block, $index),
                'resource' => self::resourceBlock($block, $index),
                default => throw new InvalidArgumentException(sprintf('Tool result content block %d has unsupported type %s.', $index, $type)),
            };
        }
    }

    /** @param array<string, mixed> $block */
    private static function textBlock(array $block, int $index): void
    {
        ToolContractGuard::exactKeys($block, ['type', 'text'], ['annotations', '_meta'], sprintf('Tool result text block %d', $index));
        ToolContractGuard::nonEmptyString($block['text'], sprintf('Tool result text block %d text', $index), 65536);
        self::optionalContentMetadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function imageBlock(array $block, int $index): void
    {
        ToolContractGuard::exactKeys($block, ['type', 'data', 'mimeType'], ['annotations', '_meta'], sprintf('Tool result image block %d', $index));
        $mimeType = ToolContractGuard::nonEmptyString($block['mimeType'], sprintf('Tool result image block %d mimeType', $index), 128);
        if (! str_starts_with($mimeType, 'image/')) {
            throw new InvalidArgumentException(sprintf('Tool result image block %d requires an image MIME type.', $index));
        }
        self::base64Data($block['data'], sprintf('Tool result image block %d data', $index));
        self::optionalContentMetadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function audioBlock(array $block, int $index): void
    {
        ToolContractGuard::exactKeys($block, ['type', 'data', 'mimeType'], ['annotations', '_meta'], sprintf('Tool result audio block %d', $index));
        $mimeType = ToolContractGuard::nonEmptyString($block['mimeType'], sprintf('Tool result audio block %d mimeType', $index), 128);
        if (! str_starts_with($mimeType, 'audio/')) {
            throw new InvalidArgumentException(sprintf('Tool result audio block %d requires an audio MIME type.', $index));
        }
        self::base64Data($block['data'], sprintf('Tool result audio block %d data', $index));
        self::optionalContentMetadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function resourceLinkBlock(array $block, int $index): void
    {
        ToolContractGuard::exactKeys(
            $block,
            ['type', 'uri', 'name'],
            ['title', 'description', 'mimeType', 'size', 'icons', 'annotations', '_meta'],
            sprintf('Tool result resource link block %d', $index),
        );
        self::uri($block['uri'], sprintf('Tool result resource link block %d URI', $index));
        ToolContractGuard::nonEmptyString($block['name'], sprintf('Tool result resource link block %d name', $index), 256);
        if (array_key_exists('title', $block)) {
            ToolContractGuard::boundedString($block['title'], sprintf('Tool result resource link block %d title', $index), 256);
        }
        if (array_key_exists('description', $block)) {
            ToolContractGuard::boundedString($block['description'], sprintf('Tool result resource link block %d description', $index), 4096);
        }
        if (array_key_exists('mimeType', $block)) {
            ToolContractGuard::nonEmptyString($block['mimeType'], sprintf('Tool result resource link block %d mimeType', $index), 128);
        }
        if (array_key_exists('size', $block)) {
            ToolContractGuard::jsonSafeNonNegativeInteger($block['size'], sprintf('Tool result resource link block %d size', $index));
        }
        if (array_key_exists('icons', $block)) {
            ToolContractGuard::mcpIconList($block['icons'], sprintf('Tool result resource link block %d icons', $index), 32);
        }
        self::optionalContentMetadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function resourceBlock(array $block, int $index): void
    {
        ToolContractGuard::exactKeys($block, ['type', 'resource'], ['annotations', '_meta'], sprintf('Tool result resource block %d', $index));
        $resource = ToolContractGuard::objectArray($block['resource'], sprintf('Tool result resource block %d resource', $index));
        ToolContractGuard::exactKeys(
            $resource,
            ['uri'],
            ['mimeType', 'text', 'blob', '_meta'],
            sprintf('Tool result resource block %d resource', $index),
        );
        self::uri($resource['uri'], sprintf('Tool result resource block %d URI', $index));
        if (array_key_exists('mimeType', $resource)) {
            ToolContractGuard::nonEmptyString($resource['mimeType'], sprintf('Tool result resource block %d mimeType', $index), 128);
        }
        $hasText = array_key_exists('text', $resource);
        $hasBlob = array_key_exists('blob', $resource);
        if ($hasText === $hasBlob) {
            throw new InvalidArgumentException(sprintf('Tool result resource block %d requires exactly one of text or blob.', $index));
        }
        if ($hasText) {
            ToolContractGuard::nonEmptyString($resource['text'], sprintf('Tool result resource block %d text', $index), 65536);
        } else {
            self::base64Data($resource['blob'], sprintf('Tool result resource block %d blob', $index));
        }
        if (array_key_exists('_meta', $resource)) {
            ToolContractGuard::objectArray($resource['_meta'], sprintf('Tool result resource block %d resource _meta', $index));
        }
        self::optionalContentMetadata($block, $index);
    }

    /** @param list<array<string, mixed>> $evidence */
    private static function evidence(array $evidence): void
    {
        ToolContractGuard::boundedListArray($evidence, 'Tool result evidence', 128);
        $seen = [];
        foreach ($evidence as $index => $item) {
            $item = ToolContractGuard::objectArray($item, sprintf('Tool result evidence %d', $index));
            ToolContractGuard::exactKeys(
                $item,
                ['artifact_id', 'kind', 'sha256', 'trusted_boundary'],
                [],
                sprintf('Tool result evidence %d', $index),
            );
            $artifactId = ToolContractGuard::nonEmptyString($item['artifact_id'], sprintf('Tool result evidence %d artifact ID', $index), 256);
            if (isset($seen[$artifactId])) {
                throw new InvalidArgumentException('Tool result evidence artifact IDs must be unique.');
            }
            $seen[$artifactId] = true;
            ToolContractGuard::nonEmptyString($item['kind'], sprintf('Tool result evidence %d kind', $index), 128);
            ToolContractGuard::sha256($item['sha256'], sprintf('Tool result evidence %d sha256', $index));
            ToolContractGuard::nonEmptyString($item['trusted_boundary'], sprintf('Tool result evidence %d trusted boundary', $index), 128);
        }
    }

    /**
     * @param list<array<string, mixed>> $content
     * @param array<string, mixed>|null $structuredContent
     * @param list<array<string, mixed>> $evidence
     */
    private static function assertArtifactReferences(array $content, ?array $structuredContent, array $evidence): void
    {
        $artifactIds = [];
        foreach ($evidence as $item) {
            if (isset($item['artifact_id']) && is_string($item['artifact_id'])) {
                $artifactIds[$item['artifact_id']] = true;
            }
        }

        foreach ($content as $block) {
            $uri = $block['type'] === 'resource_link'
                ? ($block['uri'] ?? null)
                : ($block['type'] === 'resource' ? ($block['resource']['uri'] ?? null) : null);
            $artifactId = is_string($uri) ? self::talosArtifactId($uri) : null;
            if ($artifactId !== null && ! isset($artifactIds[$artifactId])) {
                throw new InvalidArgumentException('Tool result content references TALOS evidence that was not persisted.');
            }
        }

        if (! array_key_exists('evidence_ids', $structuredContent ?? [])) {
            return;
        }
        $structuredEvidenceIds = $structuredContent['evidence_ids'];
        foreach (ToolContractGuard::boundedListArray($structuredEvidenceIds, 'Tool result structuredContent evidence_ids', 128) as $artifactId) {
            $artifactId = ToolContractGuard::nonEmptyString($artifactId, 'Tool result structuredContent evidence ID', 256);
            if (! isset($artifactIds[$artifactId])) {
                throw new InvalidArgumentException('Tool result structuredContent references evidence that was not persisted.');
            }
        }
    }

    private static function base64Data(mixed $value, string $label): void
    {
        $data = ToolContractGuard::nonEmptyString($value, $label, 16 * 1024 * 1024);
        $decoded = base64_decode($data, true);
        if ($decoded === false || base64_encode($decoded) !== $data) {
            throw new InvalidArgumentException(sprintf('%s must be valid base64.', $label));
        }
    }

    private static function uri(mixed $value, string $label): string
    {
        $uri = ToolContractGuard::nonEmptyString($value, $label, 2048);
        if (preg_match('/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/D', $uri) !== 1) {
            throw new InvalidArgumentException(sprintf('%s must be an absolute URI.', $label));
        }

        return $uri;
    }

    /** @param array<string, mixed> $block */
    private static function optionalContentMetadata(array $block, int $index): void
    {
        foreach (['annotations', '_meta'] as $field) {
            if (array_key_exists($field, $block)) {
                ToolContractGuard::objectArray($block[$field], sprintf('Tool result content block %d %s', $index, $field));
            }
        }
    }

    /** @param list<array<string, mixed>> $content @return list<array<string, mixed>> */
    private static function serializedContent(array $content): array
    {
        return array_map(static function (array $block): array {
            foreach (['annotations', '_meta'] as $field) {
                if (array_key_exists($field, $block) && is_array($block[$field])) {
                    $block[$field] = ToolContractGuard::canonicalObjectArray($block[$field]);
                }
            }
            if (($block['type'] ?? null) === 'resource'
                && is_array($block['resource'] ?? null)
                && array_key_exists('_meta', $block['resource'])
                && is_array($block['resource']['_meta'])) {
                $block['resource']['_meta'] = ToolContractGuard::canonicalObjectArray($block['resource']['_meta']);
            }

            return $block;
        }, $content);
    }

    private static function talosArtifactId(string $uri): ?string
    {
        if (! str_starts_with($uri, 'talos-artifact://')) {
            return null;
        }

        $host = parse_url($uri, PHP_URL_HOST);

        return is_string($host) && $host !== '' ? $host : null;
    }
}
