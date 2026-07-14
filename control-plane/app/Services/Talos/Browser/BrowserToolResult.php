<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;
use JsonException;
use stdClass;

final readonly class BrowserToolResult implements \JsonSerializable
{
    public const SCHEMA_VERSION = 'talos_tool_result_v1';

    /**
     * @param  list<array<string, mixed>>  $content
     * @param  array<string, mixed>|null  $structuredContent
     * @param  list<array<string, mixed>>  $evidence
     */
    public function __construct(
        public string $toolUseId,
        public bool $isError,
        public array $content,
        public ?array $structuredContent,
        public array $evidence,
        private ?stdClass $wireStructuredContent = null,
        private ?array $wireContent = null,
    ) {
        self::nonEmptyString($toolUseId, 'Tool result tool_use_id', 256);
        self::content($content);
        if ($structuredContent !== null) {
            self::object($structuredContent, 'Tool result structuredContent');
            self::jsonValue($structuredContent, 'Tool result structuredContent');
        }
        self::evidence($evidence);
        self::assertArtifactReferences($content, $structuredContent, $evidence);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value, string $expectedToolUseId): self
    {
        self::exactKeys($value, ['schema_version', 'tool_use_id', 'isError', 'content', 'structuredContent', 'evidence'], [], 'Tool result');
        if ($value['schema_version'] !== self::SCHEMA_VERSION) {
            throw new InvalidArgumentException('Tool result schema_version is unsupported.');
        }

        $toolUseId = self::nonEmptyString($value['tool_use_id'], 'Tool result tool_use_id', 256);
        $expectedToolUseId = self::nonEmptyString($expectedToolUseId, 'Expected tool use ID', 256);
        if ($toolUseId !== $expectedToolUseId) {
            throw new InvalidArgumentException('Tool result tool_use_id does not match the requested tool use ID.');
        }
        $content = self::list($value['content'], 'Tool result content');
        $structuredContent = $value['structuredContent'] === null ? null : self::object($value['structuredContent'], 'Tool result structuredContent');
        $evidence = self::list($value['evidence'], 'Tool result evidence');

        return new self(
            $toolUseId,
            self::boolean($value['isError'], 'Tool result isError'),
            $content,
            $structuredContent,
            $evidence,
        );
    }

    public static function fromJson(string $json, string $expectedToolUseId): self
    {
        try {
            $root = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Tool result JSON is malformed.', previous: $exception);
        }
        if (! $root instanceof stdClass) {
            throw new InvalidArgumentException('Tool result JSON root must be an object.');
        }
        self::assertWireShape($root);

        $parsed = self::fromArray(self::objectToArray($root), $expectedToolUseId);

        return new self(
            $parsed->toolUseId,
            $parsed->isError,
            $parsed->content,
            $parsed->structuredContent,
            $parsed->evidence,
            $root->structuredContent instanceof stdClass ? $root->structuredContent : null,
            $root->content,
        );
    }

    private static function assertWireShape(stdClass $root): void
    {
        foreach (['content', 'evidence'] as $field) {
            if (! property_exists($root, $field) || ! is_array($root->{$field})) {
                throw new InvalidArgumentException(sprintf('Tool result %s must be a list.', $field));
            }
        }
        if (property_exists($root, 'structuredContent')
            && $root->structuredContent !== null
            && ! $root->structuredContent instanceof stdClass) {
            throw new InvalidArgumentException('Tool result structuredContent must be an object or null.');
        }
        if ($root->structuredContent instanceof stdClass
            && property_exists($root->structuredContent, 'evidence_ids')
            && ! is_array($root->structuredContent->evidence_ids)) {
            throw new InvalidArgumentException('Tool result structuredContent evidence_ids must be a list.');
        }

        foreach ($root->content as $index => $block) {
            if (! $block instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('Tool result content item %d must be an object.', $index));
            }
            foreach (['annotations', '_meta'] as $field) {
                if (property_exists($block, $field) && ! $block->{$field} instanceof stdClass) {
                    throw new InvalidArgumentException(sprintf('Tool result content item %d %s must be an object.', $index, $field));
                }
            }
            if (property_exists($block, 'icons')) {
                self::assertWireIcons($block->icons, sprintf('Tool result content item %d icons', $index));
            }
            if (property_exists($block, 'resource')) {
                if (! $block->resource instanceof stdClass) {
                    throw new InvalidArgumentException(sprintf('Tool result content item %d resource must be an object.', $index));
                }
                if (property_exists($block->resource, '_meta') && ! $block->resource->_meta instanceof stdClass) {
                    throw new InvalidArgumentException(sprintf('Tool result content item %d resource _meta must be an object.', $index));
                }
            }
        }

        foreach ($root->evidence as $index => $evidence) {
            if (! $evidence instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('Tool result evidence item %d must be an object.', $index));
            }
        }
    }

    private static function assertWireIcons(mixed $icons, string $label): void
    {
        if (! is_array($icons)) {
            throw new InvalidArgumentException($label.' must be a list.');
        }
        foreach ($icons as $index => $icon) {
            if (! $icon instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('%s item %d must be an object.', $label, $index));
            }
            if (property_exists($icon, 'sizes') && ! is_array($icon->sizes)) {
                throw new InvalidArgumentException(sprintf('%s item %d sizes must be a list.', $label, $index));
            }
        }
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
            'content' => $this->wireContent !== null
                ? array_map(static fn (mixed $block): mixed => $block instanceof stdClass ? get_object_vars($block) : $block, $this->wireContent)
                : self::serializedContent($this->content),
            'structuredContent' => $this->structuredContent === null
                ? null
                : ($this->wireStructuredContent instanceof stdClass
                    ? get_object_vars($this->wireStructuredContent)
                    : self::canonicalObjectArray($this->structuredContent)),
        ];
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return $this->toWireArray();
    }

    /** @param list<array<string, mixed>> $content @return list<array<string, mixed>> */
    private static function serializedContent(array $content): array
    {
        return array_map(static function (array $block): array {
            foreach (['annotations', '_meta'] as $field) {
                if (array_key_exists($field, $block) && is_array($block[$field])) {
                    $block[$field] = self::canonicalObjectArray($block[$field]);
                }
            }
            if (($block['type'] ?? null) === 'resource'
                && is_array($block['resource'] ?? null)
                && array_key_exists('_meta', $block['resource'])
                && is_array($block['resource']['_meta'])) {
                $block['resource']['_meta'] = self::canonicalObjectArray($block['resource']['_meta']);
            }

            return $block;
        }, $content);
    }

    /** @param array<string, mixed> $value */
    private static function canonicalObjectArray(array $value): array|stdClass
    {
        return $value === [] ? new stdClass : $value;
    }

    /** @return array<string, mixed> */
    private static function objectToArray(stdClass $object): array
    {
        /** @var array<string, mixed> $value */
        $value = [];
        foreach (get_object_vars($object) as $key => $item) {
            $value[$key] = self::normalize($item);
        }

        return $value;
    }

    private static function normalize(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            return self::objectToArray($value);
        }
        if (is_array($value)) {
            return array_map(self::normalize(...), $value);
        }

        return $value;
    }

    /** @param array<string, mixed> $value @param list<string> $required @param list<string> $optional */
    private static function exactKeys(array $value, array $required, array $optional, string $label): void
    {
        $allowed = [...$required, ...$optional];
        if (array_diff(array_keys($value), $allowed) !== [] || array_diff($required, array_keys($value)) !== []) {
            throw new InvalidArgumentException($label.' contains unsupported or missing fields.');
        }
    }

    private static function nonEmptyString(mixed $value, string $label, int $maxBytes): string
    {
        if (! is_string($value) || strlen($value) > $maxBytes || preg_match('/\A[\s\p{Z}]*\z/u', $value) === 1) {
            throw new InvalidArgumentException(sprintf('%s must be a non-empty string of at most %d bytes.', $label, $maxBytes));
        }

        return $value;
    }

    private static function boundedString(mixed $value, string $label, int $maxBytes): string
    {
        if (! is_string($value) || strlen($value) > $maxBytes) {
            throw new InvalidArgumentException(sprintf('%s must be a string of at most %d bytes.', $label, $maxBytes));
        }

        return $value;
    }

    /** @return array<string, mixed> */
    private static function object(mixed $value, string $label): array
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new InvalidArgumentException($label.' must be an object-shaped array.');
        }

        return $value;
    }

    /** @return list<mixed> */
    private static function list(mixed $value, string $label, int $maxItems = PHP_INT_MAX): array
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) > $maxItems) {
            throw new InvalidArgumentException(sprintf('%s must be a list of at most %d items.', $label, $maxItems));
        }

        return $value;
    }

    private static function boolean(mixed $value, string $label): bool
    {
        if (! is_bool($value)) {
            throw new InvalidArgumentException($label.' must be a boolean.');
        }

        return $value;
    }

    /** @param list<array<string, mixed>> $content */
    private static function content(array $content): void
    {
        self::list($content, 'Tool result content', 64);
        foreach ($content as $index => $block) {
            $block = self::object($block, sprintf('Tool result content block %d', $index));
            $type = self::nonEmptyString($block['type'] ?? null, sprintf('Tool result content block %d type', $index), 64);
            match ($type) {
                'text' => self::textBlock($block, $index),
                'image' => self::binaryBlock($block, $index, 'image'),
                'audio' => self::binaryBlock($block, $index, 'audio'),
                'resource_link' => self::resourceLinkBlock($block, $index),
                'resource' => self::resourceBlock($block, $index),
                default => throw new InvalidArgumentException(sprintf('Tool result content block %d has unsupported type.', $index)),
            };
        }
    }

    /** @param array<string, mixed> $block */
    private static function textBlock(array $block, int $index): void
    {
        self::exactKeys($block, ['type', 'text'], ['annotations', '_meta'], sprintf('Tool result text block %d', $index));
        self::nonEmptyString($block['text'], sprintf('Tool result text block %d text', $index), 65536);
        self::metadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function binaryBlock(array $block, int $index, string $type): void
    {
        self::exactKeys($block, ['type', 'data', 'mimeType'], ['annotations', '_meta'], sprintf('Tool result %s block %d', $type, $index));
        $mimeType = self::nonEmptyString($block['mimeType'], sprintf('Tool result %s block %d mimeType', $type, $index), 128);
        if (! str_starts_with($mimeType, $type.'/')) {
            throw new InvalidArgumentException(sprintf('Tool result %s block %d has an invalid MIME type.', $type, $index));
        }
        self::base64($block['data'], sprintf('Tool result %s block %d data', $type, $index));
        self::metadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function resourceLinkBlock(array $block, int $index): void
    {
        self::exactKeys($block, ['type', 'uri', 'name'], ['title', 'description', 'mimeType', 'size', 'icons', 'annotations', '_meta'], sprintf('Tool result resource link block %d', $index));
        self::uri($block['uri'], sprintf('Tool result resource link block %d URI', $index));
        self::nonEmptyString($block['name'], sprintf('Tool result resource link block %d name', $index), 256);
        if (array_key_exists('title', $block)) {
            self::boundedString($block['title'], sprintf('Tool result resource link block %d title', $index), 256);
        }
        if (array_key_exists('description', $block)) {
            self::boundedString($block['description'], sprintf('Tool result resource link block %d description', $index), 4096);
        }
        if (array_key_exists('mimeType', $block)) {
            self::nonEmptyString($block['mimeType'], sprintf('Tool result resource link block %d mimeType', $index), 128);
        }
        if (array_key_exists('size', $block)) {
            self::jsonSafeNonNegativeInteger($block['size'], sprintf('Tool result resource link block %d size', $index));
        }
        if (array_key_exists('icons', $block)) {
            self::icons($block['icons'], $index);
        }
        self::metadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function resourceBlock(array $block, int $index): void
    {
        self::exactKeys($block, ['type', 'resource'], ['annotations', '_meta'], sprintf('Tool result resource block %d', $index));
        $resource = self::object($block['resource'], sprintf('Tool result resource block %d resource', $index));
        self::exactKeys($resource, ['uri'], ['mimeType', 'text', 'blob', '_meta'], sprintf('Tool result resource block %d resource', $index));
        self::uri($resource['uri'], sprintf('Tool result resource block %d URI', $index));
        if (array_key_exists('mimeType', $resource)) {
            self::nonEmptyString($resource['mimeType'], sprintf('Tool result resource block %d mimeType', $index), 128);
        }
        $hasText = array_key_exists('text', $resource);
        $hasBlob = array_key_exists('blob', $resource);
        if ($hasText === $hasBlob) {
            throw new InvalidArgumentException(sprintf('Tool result resource block %d requires exactly one of text or blob.', $index));
        }
        if ($hasText) {
            self::nonEmptyString($resource['text'], sprintf('Tool result resource block %d text', $index), 65536);
        } else {
            self::base64($resource['blob'], sprintf('Tool result resource block %d blob', $index));
        }
        if (array_key_exists('_meta', $resource)) {
            self::object($resource['_meta'], sprintf('Tool result resource block %d resource _meta', $index));
        }
        self::metadata($block, $index);
    }

    /** @param array<string, mixed> $block */
    private static function metadata(array $block, int $index): void
    {
        foreach (['annotations', '_meta'] as $field) {
            if (array_key_exists($field, $block)) {
                self::object($block[$field], sprintf('Tool result content block %d %s', $index, $field));
            }
        }
    }

    private static function base64(mixed $value, string $label): void
    {
        $data = self::nonEmptyString($value, $label, 16 * 1024 * 1024);
        $decoded = base64_decode($data, true);
        if ($decoded === false || base64_encode($decoded) !== $data) {
            throw new InvalidArgumentException($label.' must be valid canonical base64.');
        }
    }

    private static function uri(mixed $value, string $label): string
    {
        $uri = self::nonEmptyString($value, $label, 2048);
        if (preg_match('/\A[A-Za-z][A-Za-z0-9+.-]*:[^\s]*\z/D', $uri) !== 1) {
            throw new InvalidArgumentException($label.' must be an absolute URI.');
        }

        return $uri;
    }

    /** @param list<array<string, mixed>> $icons */
    private static function icons(mixed $icons, int $index): void
    {
        foreach (self::list($icons, sprintf('Tool result resource link block %d icons', $index), 32) as $iconIndex => $icon) {
            $icon = self::object($icon, sprintf('Tool result icon %d', $iconIndex));
            self::exactKeys($icon, ['src'], ['mimeType', 'sizes', 'theme'], sprintf('Tool result icon %d', $iconIndex));
            self::nonEmptyString($icon['src'], sprintf('Tool result icon %d src', $iconIndex), 2048);
            if (preg_match('/\A(?:https?:\/\/|data:)[^\s]+\z/i', $icon['src']) !== 1) {
                throw new InvalidArgumentException('Tool result icon src must be an HTTP(S) or data URI.');
            }
            if (array_key_exists('mimeType', $icon)) {
                self::nonEmptyString($icon['mimeType'], sprintf('Tool result icon %d mimeType', $iconIndex), 128);
            }
            if (array_key_exists('sizes', $icon)) {
                foreach (self::list($icon['sizes'], sprintf('Tool result icon %d sizes', $iconIndex), 16) as $size) {
                    $size = self::nonEmptyString($size, sprintf('Tool result icon %d size', $iconIndex), 32);
                    if (preg_match('/\A(?:any|\d+x\d+)\z/D', $size) !== 1) {
                        throw new InvalidArgumentException('Tool result icon size is invalid.');
                    }
                }
            }
            if (array_key_exists('theme', $icon) && (! is_string($icon['theme']) || ! in_array($icon['theme'], ['light', 'dark'], true))) {
                throw new InvalidArgumentException('Tool result icon theme is invalid.');
            }
        }
    }

    private static function jsonSafeNonNegativeInteger(mixed $value, string $label): void
    {
        $valid = is_int($value) && $value >= 0
            || is_float($value) && is_finite($value) && $value >= 0 && floor($value) === $value && $value <= 9007199254740991;
        if (! $valid) {
            throw new InvalidArgumentException($label.' must be a JSON-safe non-negative integer.');
        }
    }

    /** @param list<array<string, mixed>> $evidence */
    private static function evidence(array $evidence): void
    {
        self::list($evidence, 'Tool result evidence', 128);
        $seen = [];
        foreach ($evidence as $index => $item) {
            $item = self::object($item, sprintf('Tool result evidence %d', $index));
            self::exactKeys($item, ['artifact_id', 'kind', 'sha256', 'trusted_boundary'], [], sprintf('Tool result evidence %d', $index));
            $artifactId = self::nonEmptyString($item['artifact_id'], 'Tool result evidence artifact_id', 256);
            if (isset($seen[$artifactId])) {
                throw new InvalidArgumentException('Tool result evidence artifact IDs must be unique.');
            }
            $seen[$artifactId] = true;
            self::nonEmptyString($item['kind'], 'Tool result evidence kind', 128);
            if (! is_string($item['sha256']) || preg_match('/\Asha256:[a-f0-9]{64}\z/D', $item['sha256']) !== 1) {
                throw new InvalidArgumentException('Tool result evidence sha256 must be a lowercase digest.');
            }
            self::nonEmptyString($item['trusted_boundary'], 'Tool result evidence trusted_boundary', 128);
        }
    }

    /** @param list<array<string, mixed>> $content @param array<string, mixed>|null $structuredContent @param list<array<string, mixed>> $evidence */
    private static function assertArtifactReferences(array $content, ?array $structuredContent, array $evidence): void
    {
        $evidenceIds = [];
        foreach ($evidence as $item) {
            $evidenceIds[$item['artifact_id']] = true;
        }
        foreach ($content as $block) {
            $uri = $block['type'] === 'resource_link' ? ($block['uri'] ?? null) : ($block['type'] === 'resource' ? ($block['resource']['uri'] ?? null) : null);
            if (is_string($uri) && str_starts_with($uri, 'talos-artifact://')) {
                $artifactId = parse_url($uri, PHP_URL_HOST);
                if (! is_string($artifactId) || ! isset($evidenceIds[$artifactId])) {
                    throw new InvalidArgumentException('Tool result content references missing evidence.');
                }
            }
        }
        if (! array_key_exists('evidence_ids', $structuredContent ?? [])) {
            return;
        }
        foreach (self::list($structuredContent['evidence_ids'], 'Tool result structuredContent evidence_ids', 128) as $artifactId) {
            $artifactId = self::nonEmptyString($artifactId, 'Tool result structuredContent evidence ID', 256);
            if (! isset($evidenceIds[$artifactId])) {
                throw new InvalidArgumentException('Tool result structuredContent references missing evidence.');
            }
        }
    }

    private static function jsonValue(mixed $value, string $label): void
    {
        if (is_object($value) || is_resource($value)) {
            throw new InvalidArgumentException($label.' must contain JSON-compatible values only.');
        }
        try {
            json_encode($value, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException($label.' must contain JSON-compatible values only.', previous: $exception);
        }
    }
}
