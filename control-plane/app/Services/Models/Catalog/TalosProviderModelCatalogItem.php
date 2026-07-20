<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * Immutable canonical provider model-catalog item.
 *
 * Adapters build validated instances from decoded provider responses. The
 * shape returned by toArray() is frozen by the FV2-06.0 ledger and is the only
 * projection exposed to the browser.
 */
final class TalosProviderModelCatalogItem
{
    private const MAX_ID_BYTES = 512;
    private const MAX_LABEL_BYTES = 512;
    private const MAX_OWNED_BY_BYTES = 255;
    private const MAX_METADATA_BYTES = 4096;

    private const CHAT_COMPATIBILITY = ['supported', 'unsupported', 'unknown'];
    private const LIFECYCLE = ['stable', 'preview', 'experimental', 'deprecated', 'unknown'];
    private const CAPABILITY_KEYS = ['text', 'vision', 'tools', 'reasoning', 'embeddings', 'image_output', 'audio_output'];

    private readonly string $id;
    private readonly string $displayName;
    private readonly string $provider;
    private readonly ?string $ownedBy;
    private readonly string $chatCompatibility;
    /** @var array<string, bool|null> */
    private readonly array $capabilities;
    private readonly ?int $contextWindow;
    private readonly ?int $maxOutputTokens;
    private readonly string $lifecycle;
    private readonly ?string $canonicalSlug;
    private readonly ?string $localDigest;
    /** @var array<string, scalar|array<int, scalar>> */
    private readonly array $metadata;

    /**
     * @param  array<string, mixed>  $capabilities
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        string $id,
        string $displayName,
        string $provider,
        ?string $ownedBy,
        string $chatCompatibility,
        array $capabilities,
        ?int $contextWindow,
        ?int $maxOutputTokens,
        string $lifecycle,
        ?string $canonicalSlug,
        ?string $localDigest,
        array $metadata,
    ) {
        $this->id = self::requireBoundedNonEmpty($id, self::MAX_ID_BYTES, 'id');
        $this->displayName = self::requireBoundedNonEmpty($displayName, self::MAX_LABEL_BYTES, 'display_name');
        $this->provider = self::requireBoundedNonEmpty($provider, self::MAX_LABEL_BYTES, 'provider');
        $this->ownedBy = self::optionalBounded($ownedBy, self::MAX_OWNED_BY_BYTES, 'owned_by');

        if (! in_array($chatCompatibility, self::CHAT_COMPATIBILITY, true)) {
            throw new InvalidArgumentException('Invalid chat_compatibility for a catalog item.');
        }
        $this->chatCompatibility = $chatCompatibility;

        if (! in_array($lifecycle, self::LIFECYCLE, true)) {
            throw new InvalidArgumentException('Invalid lifecycle for a catalog item.');
        }
        $this->lifecycle = $lifecycle;

        $this->capabilities = self::normalizeCapabilities($capabilities);
        $this->contextWindow = self::optionalPositiveInt($contextWindow, 'context_window');
        $this->maxOutputTokens = self::optionalPositiveInt($maxOutputTokens, 'max_output_tokens');
        $this->canonicalSlug = self::optionalBounded($canonicalSlug, self::MAX_ID_BYTES, 'canonical_slug');

        if ($localDigest !== null && preg_match('/^[a-f0-9]{64}$/', $localDigest) !== 1) {
            throw new InvalidArgumentException('local_digest must be a lowercase SHA-256 string.');
        }
        $this->localDigest = $localDigest;

        $this->metadata = self::normalizeMetadata($metadata);
    }

    public function id(): string
    {
        return $this->id;
    }

    /**
     * @return array{
     *     id: string, display_name: string, provider: string, owned_by: ?string,
     *     chat_compatibility: string, capabilities: array<string, bool|null>,
     *     context_window: ?int, max_output_tokens: ?int, lifecycle: string,
     *     canonical_slug: ?string, local_digest: ?string,
     *     metadata: array<string, scalar|array<int, scalar>>
     * }
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'display_name' => $this->displayName,
            'provider' => $this->provider,
            'owned_by' => $this->ownedBy,
            'chat_compatibility' => $this->chatCompatibility,
            'capabilities' => $this->capabilities,
            'context_window' => $this->contextWindow,
            'max_output_tokens' => $this->maxOutputTokens,
            'lifecycle' => $this->lifecycle,
            'canonical_slug' => $this->canonicalSlug,
            'local_digest' => $this->localDigest,
            'metadata' => $this->metadata,
        ];
    }

    private static function requireBoundedNonEmpty(string $value, int $maxBytes, string $field): string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            throw new InvalidArgumentException("{$field} must be a non-empty string.");
        }
        if (strlen($trimmed) > $maxBytes) {
            throw new InvalidArgumentException("{$field} exceeds the maximum length.");
        }

        return $trimmed;
    }

    private static function optionalBounded(?string $value, int $maxBytes, string $field): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }
        if (strlen($trimmed) > $maxBytes) {
            throw new InvalidArgumentException("{$field} exceeds the maximum length.");
        }

        return $trimmed;
    }

    private static function optionalPositiveInt(?int $value, string $field): ?int
    {
        if ($value === null) {
            return null;
        }
        if ($value <= 0) {
            throw new InvalidArgumentException("{$field} must be a positive integer or null.");
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $capabilities
     * @return array<string, bool|null>
     */
    private static function normalizeCapabilities(array $capabilities): array
    {
        $normalized = [];
        foreach (self::CAPABILITY_KEYS as $key) {
            if (! array_key_exists($key, $capabilities)) {
                $normalized[$key] = null;

                continue;
            }
            $value = $capabilities[$key];
            if ($value !== null && ! is_bool($value)) {
                throw new InvalidArgumentException("Capability {$key} must be true, false or null.");
            }
            $normalized[$key] = $value;
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, scalar|array<int, scalar>>
     */
    private static function normalizeMetadata(array $metadata): array
    {
        $normalized = [];
        foreach ($metadata as $key => $value) {
            if (! is_string($key) || $key === '') {
                throw new InvalidArgumentException('Metadata keys must be non-empty strings.');
            }
            if (is_scalar($value) || $value === null) {
                $normalized[$key] = $value;

                continue;
            }
            if (is_array($value) && array_is_list($value)) {
                foreach ($value as $element) {
                    if (! is_scalar($element) && $element !== null) {
                        throw new InvalidArgumentException('Metadata list values must be scalar.');
                    }
                }
                $normalized[$key] = $value;

                continue;
            }
            throw new InvalidArgumentException('Metadata values must be scalar or a list of scalars.');
        }

        if (strlen((string) json_encode($normalized)) > self::MAX_METADATA_BYTES) {
            throw new InvalidArgumentException('Metadata exceeds the maximum serialized size.');
        }

        return $normalized;
    }
}
