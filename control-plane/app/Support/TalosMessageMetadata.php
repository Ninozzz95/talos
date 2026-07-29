<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;
use InvalidArgumentException;

final class TalosMessageMetadata
{
    public const CONTRACT = 'talos.message.metadata.v2';

    /** @var list<string> */
    private const SERVER_OWNED_CLIENT_KEYS = [
        'artifacts',
        'browser_activities',
        'tool_activities',
        'used_browser_context',
        'visible_reasoning',
    ];

    /** @var list<string> */
    private const PROVIDER_PRIVATE_KEYS = [
        'authorization',
        'continuation_state',
        'cookie',
        'encrypted_content',
        'headers',
        'provider_state',
        'raw_tool_arguments',
        'raw_tool_result',
        'redacted_thinking',
        'set_cookie',
        'signature',
        'thought_signature',
    ];

    /** @var array<string, mixed> */
    private array $metadata;

    /**
     * @param array<string, mixed> $metadata
     */
    private function __construct(array $metadata)
    {
        $this->metadata = $metadata;
    }

    public static function fromStorage(mixed $value): self
    {
        if (! is_array($value) || array_is_list($value)) {
            return new self(['contract' => self::CONTRACT]);
        }

        $metadata = self::sanitizeArray($value);
        $metadata = self::normalizeKnownFields($metadata, strict: false);
        $metadata['contract'] = self::CONTRACT;

        return new self($metadata);
    }

    public static function fromClientInput(mixed $value): self
    {
        if ($value === null) {
            return new self(['contract' => self::CONTRACT]);
        }
        if (! is_array($value) || array_is_list($value)) {
            throw new InvalidArgumentException('Message metadata must be a JSON object.');
        }

        self::assertNoForbiddenKeys($value);
        $metadata = self::sanitizeArray($value);
        foreach (self::SERVER_OWNED_CLIENT_KEYS as $key) {
            unset($metadata[$key]);
        }
        $metadata = self::normalizeKnownFields($metadata, strict: true);
        $metadata['contract'] = self::CONTRACT;

        return new self($metadata);
    }

    /**
     * @return array<string, mixed>
     */
    public function toStorageArray(): array
    {
        return $this->metadata;
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return $this->metadata;
    }

    /**
     * @return array<string, mixed>
     */
    public function toExportArray(): array
    {
        return $this->metadata;
    }

    /**
     * @param array<string, mixed> $metadata
     * @return array<string, mixed>
     */
    private static function normalizeKnownFields(array $metadata, bool $strict): array
    {
        unset($metadata['contract']);

        $normalizers = [
            'attachments' => self::normalizeAttachments(...),
            'visible_reasoning' => self::normalizeVisibleReasoning(...),
            'tool_activities' => self::normalizeToolActivities(...),
            'usage' => self::normalizeMetrics(...),
            'timing' => self::normalizeMetrics(...),
        ];

        foreach ($normalizers as $key => $normalizer) {
            if (! array_key_exists($key, $metadata)) {
                continue;
            }

            try {
                $metadata[$key] = $normalizer($metadata[$key]);
            } catch (InvalidArgumentException $exception) {
                if ($strict) {
                    throw $exception;
                }

                unset($metadata[$key]);
            }
        }

        return $metadata;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function normalizeAttachments(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) > 20) {
            throw new InvalidArgumentException('Message attachments must be a bounded list.');
        }

        $attachments = [];
        $seen = [];
        foreach ($value as $candidate) {
            if (! is_array($candidate) || array_is_list($candidate)) {
                throw new InvalidArgumentException('Each message attachment must be an object.');
            }

            $fileId = self::boundedString($candidate['file_id'] ?? null, 255, 'Attachment file ID');
            $name = self::boundedString($candidate['name'] ?? null, 255, 'Attachment name');
            if (isset($seen[$fileId])) {
                throw new InvalidArgumentException('Message attachment file IDs must be unique.');
            }
            $seen[$fileId] = true;

            $attachment = [
                'file_id' => $fileId,
                'name' => $name,
            ];
            if (array_key_exists('mime_type', $candidate) && $candidate['mime_type'] !== null) {
                $attachment['mime_type'] = self::boundedString($candidate['mime_type'], 120, 'Attachment MIME');
            }
            if (array_key_exists('size_bytes', $candidate) && $candidate['size_bytes'] !== null) {
                $attachment['size_bytes'] = self::nonNegativeInteger($candidate['size_bytes'], 'Attachment size');
            }
            if (array_key_exists('content_url', $candidate) && $candidate['content_url'] !== null) {
                $contentUrl = self::boundedString($candidate['content_url'], 512, 'Attachment content URL');
                if ($contentUrl !== '/api/talos/files/'.$fileId.'/content') {
                    throw new InvalidArgumentException('Attachment content URL is not canonical.');
                }
                $attachment['content_url'] = $contentUrl;
            }

            $attachments[] = $attachment;
        }

        return $attachments;
    }

    /**
     * @return array{source: string, text: string, duration_ms: int|null, provider?: string}
     */
    private static function normalizeVisibleReasoning(mixed $value): array
    {
        if (! is_array($value) || array_is_list($value)) {
            throw new InvalidArgumentException('Visible reasoning must be an object.');
        }

        $source = self::boundedString($value['source'] ?? null, 32, 'Visible reasoning source');
        if (! in_array($source, ['provider', 'avm_summary'], true)) {
            throw new InvalidArgumentException('Visible reasoning source is unsupported.');
        }

        $reasoning = [
            'source' => $source,
            'text' => self::boundedString($value['text'] ?? null, 20_000, 'Visible reasoning text'),
            'duration_ms' => $value['duration_ms'] === null || ! array_key_exists('duration_ms', $value)
                ? null
                : self::nonNegativeInteger($value['duration_ms'], 'Visible reasoning duration'),
        ];
        if (array_key_exists('provider', $value) && $value['provider'] !== null) {
            $reasoning['provider'] = self::boundedString($value['provider'], 64, 'Visible reasoning provider');
        }

        return $reasoning;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function normalizeToolActivities(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) > 100) {
            throw new InvalidArgumentException('Tool activities must be a bounded list.');
        }

        $activities = [];
        $seen = [];
        foreach ($value as $candidate) {
            if (! is_array($candidate) || array_is_list($candidate)) {
                throw new InvalidArgumentException('Each tool activity must be an object.');
            }

            $id = self::boundedString($candidate['id'] ?? null, 255, 'Tool activity ID');
            if (isset($seen[$id])) {
                throw new InvalidArgumentException('Tool activity IDs must be unique.');
            }
            $seen[$id] = true;

            $status = self::boundedString($candidate['status'] ?? null, 32, 'Tool activity status');
            if (! in_array($status, ['running', 'succeeded', 'failed', 'cancelled'], true)) {
                throw new InvalidArgumentException('Tool activity status is unsupported.');
            }

            $startedAt = self::isoDate($candidate['started_at'] ?? null, 'Tool activity start');
            $completedAt = null;
            if (array_key_exists('completed_at', $candidate) && $candidate['completed_at'] !== null) {
                $completedAt = self::isoDate($candidate['completed_at'], 'Tool activity completion');
                if (new DateTimeImmutable($completedAt) < new DateTimeImmutable($startedAt)) {
                    throw new InvalidArgumentException('Tool activity completion precedes its start.');
                }
            }

            $activities[] = [
                'id' => $id,
                'name' => self::boundedString($candidate['name'] ?? null, 160, 'Tool activity name'),
                'status' => $status,
                'started_at' => $startedAt,
                'completed_at' => $completedAt,
            ];
        }

        return $activities;
    }

    /**
     * @return array<string, int|float|array<string, mixed>>
     */
    private static function normalizeMetrics(mixed $value): array
    {
        if (! is_array($value) || array_is_list($value) || count($value) > 50) {
            throw new InvalidArgumentException('Message metrics must be a bounded object.');
        }

        $metrics = [];
        foreach ($value as $key => $metric) {
            if (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]{0,63}$/', $key)) {
                throw new InvalidArgumentException('Message metric names must be canonical.');
            }
            if (is_array($metric)) {
                $metrics[$key] = self::normalizeMetrics($metric);
                continue;
            }
            if (! is_int($metric) && ! is_float($metric)) {
                throw new InvalidArgumentException('Message metric values must be numeric.');
            }
            if ($metric < 0 || (is_float($metric) && ! is_finite($metric))) {
                throw new InvalidArgumentException('Message metric values cannot be negative or non-finite.');
            }
            $metrics[$key] = $metric;
        }

        return $metrics;
    }

    /**
     * @param array<string|int, mixed>|list<mixed> $value
     * @return array<string|int, mixed>|list<mixed>
     */
    private static function sanitizeArray(array $value): array
    {
        $sanitized = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && self::isForbiddenKey($key)) {
                continue;
            }
            if (is_array($item)) {
                $sanitized[$key] = self::sanitizeArray($item);
                continue;
            }
            if ($item === null || is_bool($item) || is_int($item) || is_string($item)) {
                $sanitized[$key] = $item;
                continue;
            }
            if (is_float($item) && is_finite($item)) {
                $sanitized[$key] = $item;
            }
        }

        return $sanitized;
    }

    /**
     * @param array<string|int, mixed>|list<mixed> $value
     */
    private static function assertNoForbiddenKeys(array $value): void
    {
        foreach ($value as $key => $item) {
            if (is_string($key) && self::isForbiddenKey($key)) {
                throw new InvalidArgumentException('Message metadata contains a forbidden private field.');
            }
            if (is_array($item)) {
                self::assertNoForbiddenKeys($item);
            }
        }
    }

    private static function isForbiddenKey(string $key): bool
    {
        $normalized = strtolower(str_replace(['-', ' ', '.'], '_', $key));

        return in_array($normalized, self::PROVIDER_PRIVATE_KEYS, true)
            || self::isSecretLikeKey($normalized);
    }

    private static function isSecretLikeKey(string $normalized): bool
    {
        $tokenMetricKeys = [
            'cached_tokens',
            'completion_tokens',
            'input_tokens',
            'output_tokens',
            'prompt_tokens',
            'reasoning_tokens',
            'token_count',
            'token_estimate',
            'tokens',
            'total_tokens',
        ];
        $tokenMetricPrefixes = [
            'accepted_prediction',
            'audio',
            'cache_creation_input',
            'cache_read_input',
            'cached',
            'completion',
            'image',
            'input',
            'output',
            'prompt',
            'reasoning',
            'rejected_prediction',
            'text',
            'total',
        ];

        if (in_array($normalized, $tokenMetricKeys, true)
            || str_ends_with($normalized, '_token_count')
            || str_ends_with($normalized, '_token_estimate')) {
            return false;
        }
        foreach ($tokenMetricPrefixes as $prefix) {
            if ($normalized === $prefix.'_tokens') {
                return false;
            }
        }

        return str_contains($normalized, 'api_key')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
            || $normalized === 'token'
            || str_contains($normalized, 'access_token')
            || str_contains($normalized, 'api_token')
            || str_contains($normalized, 'auth_token')
            || str_contains($normalized, 'bearer_token')
            || str_contains($normalized, 'client_token')
            || str_contains($normalized, 'csrf_token')
            || str_contains($normalized, 'id_token')
            || str_contains($normalized, 'refresh_token')
            || str_contains($normalized, 'session_token')
            || str_contains($normalized, 'token_hash')
            || str_contains($normalized, 'token_value');
    }

    private static function boundedString(mixed $value, int $maxLength, string $label): string
    {
        if (! is_string($value)) {
            throw new InvalidArgumentException($label.' must be a string.');
        }

        $trimmed = trim($value);
        if ($trimmed === '' || mb_strlen($trimmed) > $maxLength) {
            throw new InvalidArgumentException($label.' is empty or too long.');
        }

        return $trimmed;
    }

    private static function nonNegativeInteger(mixed $value, string $label): int
    {
        if (! is_int($value) || $value < 0) {
            throw new InvalidArgumentException($label.' must be a non-negative integer.');
        }

        return $value;
    }

    private static function isoDate(mixed $value, string $label): string
    {
        $date = self::boundedString($value, 64, $label);
        if (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/', $date)) {
            throw new InvalidArgumentException($label.' must use an ISO-8601 timestamp.');
        }

        try {
            new DateTimeImmutable($date);
        } catch (\Throwable) {
            throw new InvalidArgumentException($label.' is not a valid timestamp.');
        }

        return $date;
    }
}
