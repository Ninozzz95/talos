<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class LibraryItemV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::LibraryItem);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::LibraryItem));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::LibraryItem);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        $content = $value['content'];
        if ($content['status'] === 'available' && ($content['sha256'] ?? null) === null) {
            self::fail('library_available_digest_required', 'Available byte content requires a SHA-256 digest.');
        }
        if ($content['status'] === 'available'
            && (! is_string($content['content_ref']) || $content['content_ref'] === '')) {
            self::fail('library_available_reference_required', 'Available byte content requires an opaque logical content reference.');
        }
        if (is_string($content['content_ref']) && ! self::isLogicalReference($content['content_ref'])) {
            self::fail('library_content_ref_private', 'Content reference must be logical and must not expose a path, URI, signed URL, or secret.');
        }

        $provenance = $value['provenance'];
        if ($provenance['entity_id'] !== $value['id']) {
            self::fail('library_entity_mismatch', 'Provenance entity ID must equal the Library item ID.');
        }

        $credentials = $provenance['content_credentials'];
        if (in_array($credentials['verification'], ['valid', 'invalid'], true) && $credentials['present'] !== true) {
            self::fail('library_credentials_unverified', 'Valid or invalid content credentials require a present credential payload.');
        }
        if ($credentials['format'] === 'none'
            && ($credentials['present'] !== false
                || $credentials['verification'] !== 'not_checked'
                || ($credentials['issuer'] ?? null) !== null)) {
            self::fail('library_credentials_none_invalid', 'Absent content credentials cannot claim presence, verification, or issuer.');
        }

        if (($value['metadata']['persistence_mode'] ?? null) === 'temporary') {
            $activity = $provenance['activity'];
            if (($activity['session_id'] ?? null) !== null || ($activity['prompt_message_id'] ?? null) !== null) {
                self::fail('library_ephemeral_provenance', 'Temporary sessions cannot persist session or prompt identifiers in Library provenance.');
            }
        }
    }

    private static function isLogicalReference(string $reference): bool
    {
        return preg_match('/\A[a-z][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._:\/-]*\z/D', $reference) === 1
            && ! str_contains($reference, '://')
            && ! str_contains($reference, '\\');
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::LibraryItem, $details);
    }
}
