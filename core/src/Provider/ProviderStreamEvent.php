<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use Kadmos\Tool\ProviderTurnResponse;

final readonly class ProviderStreamEvent
{
    public const TEXT_DELTA = 'text_delta';
    public const REASONING_DELTA = 'reasoning_delta';
    public const TOOL_CALL_DELTA = 'tool_call_delta';
    public const USAGE = 'usage';
    public const ARTIFACT = 'artifact';
    public const COMPLETED = 'completed';
    public const FAILED = 'failed';
    public const HEARTBEAT = 'heartbeat';
    public const CANCELLED = 'cancelled';

    private const KINDS = [
        self::TEXT_DELTA,
        self::REASONING_DELTA,
        self::TOOL_CALL_DELTA,
        self::USAGE,
        self::ARTIFACT,
        self::COMPLETED,
        self::FAILED,
        self::HEARTBEAT,
        self::CANCELLED,
    ];

    /** @param array<string, mixed> $payload */
    public function __construct(
        public string $kind,
        public int $sequence,
        public array $payload,
    ) {
        if (! in_array($kind, self::KINDS, true)) {
            throw new InvalidArgumentException('Provider stream event kind is unsupported.');
        }
        if ($sequence < 1) {
            throw new InvalidArgumentException('Provider stream event sequence must be positive.');
        }

        $this->validatePayload();
    }

    public static function fromOutcome(int $sequence, ProviderTurnResponse $outcome): self
    {
        if ($outcome->kind === ProviderTurnResponse::FAILURE) {
            $failure = $outcome->failure;
            if (! $failure instanceof ProviderFailure) {
                throw new InvalidArgumentException('Provider failure outcome is missing its typed failure.');
            }

            return new self(self::FAILED, $sequence, [
                'code' => $failure->code,
                'message' => $failure->message,
                'retryable' => $failure->retryable,
                'http_status' => $failure->httpStatus,
            ]);
        }

        return new self(self::COMPLETED, $sequence, [
            'outcome' => $outcome->kind,
            'response_id' => $outcome->responseId,
            'stop_reason' => $outcome->stopReason,
        ]);
    }

    public function isTerminal(): bool
    {
        return in_array($this->kind, [self::COMPLETED, self::FAILED, self::CANCELLED], true);
    }

    /** @return array{kind: string, sequence: int, payload: array<string, mixed>} */
    public function toArray(): array
    {
        return [
            'kind' => $this->kind,
            'sequence' => $this->sequence,
            'payload' => $this->payload,
        ];
    }

    private function validatePayload(): void
    {
        match ($this->kind) {
            self::TEXT_DELTA, self::REASONING_DELTA => $this->validateTextPayload(),
            self::TOOL_CALL_DELTA => $this->validateToolPayload(),
            self::USAGE => $this->validateUsagePayload(),
            self::ARTIFACT => $this->validateArtifactPayload(),
            self::COMPLETED => $this->validateCompletedPayload(),
            self::FAILED => $this->validateFailurePayload(),
            self::HEARTBEAT => $this->assertExactKeys([]),
            self::CANCELLED => $this->validateCancelledPayload(),
        };
    }

    private function validateTextPayload(): void
    {
        $this->assertExactKeys(['text']);
        $this->boundedString($this->payload['text'], 'Provider stream text delta', 65_536);
    }

    private function validateToolPayload(): void
    {
        $this->assertExactKeys([
            'index',
            'provider_call_id',
            'name',
            'arguments_delta',
        ]);

        if (! is_int($this->payload['index']) || $this->payload['index'] < 0) {
            throw new InvalidArgumentException('Provider stream tool-call index must be non-negative.');
        }
        foreach ([
            'provider_call_id' => 256,
            'name' => 128,
            'arguments_delta' => 65_536,
        ] as $field => $limit) {
            $value = $this->payload[$field];
            if ($value !== null) {
                $this->boundedString($value, "Provider stream tool-call {$field}", $limit);
            }
        }
        if ($this->payload['provider_call_id'] === null
            && $this->payload['name'] === null
            && $this->payload['arguments_delta'] === null) {
            throw new InvalidArgumentException('Provider stream tool-call delta must contain new state.');
        }
    }

    private function validateUsagePayload(): void
    {
        $this->assertExactKeys([
            'input_tokens',
            'output_tokens',
            'total_tokens',
            'cached_tokens',
            'cache_read_tokens',
            'cache_write_tokens',
            'cache_miss_tokens',
            'cache_write_5m_tokens',
            'cache_write_1h_tokens',
        ]);
        foreach (['input_tokens', 'output_tokens', 'total_tokens', 'cached_tokens'] as $field) {
            $value = $this->payload[$field];
            if (! is_int($value) || $value < 0) {
                throw new InvalidArgumentException('Provider stream usage values must be non-negative integers.');
            }
        }
        foreach ([
            'cache_read_tokens',
            'cache_write_tokens',
            'cache_miss_tokens',
            'cache_write_5m_tokens',
            'cache_write_1h_tokens',
        ] as $field) {
            $value = $this->payload[$field];
            if ($value !== null && (! is_int($value) || $value < 0)) {
                throw new InvalidArgumentException('Provider stream cache usage values must be null or non-negative integers.');
            }
        }
        if ($this->payload['cache_read_tokens'] !== null
            && $this->payload['cached_tokens'] !== $this->payload['cache_read_tokens']) {
            throw new InvalidArgumentException('Provider stream cached-token compatibility value must match cache reads.');
        }
        if ($this->payload['cache_write_tokens'] !== null
            && ($this->payload['cache_write_5m_tokens'] !== null
                || $this->payload['cache_write_1h_tokens'] !== null)
            && ($this->payload['cache_write_5m_tokens'] ?? 0)
                + ($this->payload['cache_write_1h_tokens'] ?? 0)
                !== $this->payload['cache_write_tokens']) {
            throw new InvalidArgumentException('Provider stream cache-write TTL breakdown must match total cache writes.');
        }
    }

    private function validateArtifactPayload(): void
    {
        $this->assertExactKeys(['artifact_type', 'uri', 'mime_type', 'metadata']);
        $this->boundedString($this->payload['artifact_type'], 'Provider stream artifact type', 128);
        $this->boundedString($this->payload['uri'], 'Provider stream artifact URI', 2_048);
        if ($this->payload['mime_type'] !== null) {
            $this->boundedString($this->payload['mime_type'], 'Provider stream artifact MIME type', 255);
        }
        if (! is_array($this->payload['metadata'])) {
            throw new InvalidArgumentException('Provider stream artifact metadata must be an object.');
        }
        json_encode($this->payload['metadata'], JSON_THROW_ON_ERROR);
    }

    private function validateCompletedPayload(): void
    {
        $this->assertExactKeys(['outcome', 'response_id', 'stop_reason']);
        if (! in_array($this->payload['outcome'], [
            ProviderTurnResponse::FINAL,
            ProviderTurnResponse::TOOL_CALLS,
            ProviderTurnResponse::REFUSAL,
            ProviderTurnResponse::INCOMPLETE,
        ], true)) {
            throw new InvalidArgumentException('Provider stream completion outcome is unsupported.');
        }
        foreach (['response_id', 'stop_reason'] as $field) {
            if ($this->payload[$field] !== null) {
                $this->boundedString($this->payload[$field], "Provider stream completion {$field}", 256);
            }
        }
    }

    private function validateFailurePayload(): void
    {
        $this->assertExactKeys(['code', 'message', 'retryable', 'http_status']);
        if (! is_string($this->payload['code'])
            || preg_match('/^[A-Z][A-Z0-9_]{0,127}$/', $this->payload['code']) !== 1) {
            throw new InvalidArgumentException('Provider stream failure code is invalid.');
        }
        $this->boundedString($this->payload['message'], 'Provider stream failure message', 4_096);
        if (! is_bool($this->payload['retryable'])) {
            throw new InvalidArgumentException('Provider stream failure retryable flag must be boolean.');
        }
        $status = $this->payload['http_status'];
        if ($status !== null && (! is_int($status) || $status < 100 || $status > 599)) {
            throw new InvalidArgumentException('Provider stream failure HTTP status is invalid.');
        }
    }

    private function validateCancelledPayload(): void
    {
        $this->assertExactKeys(['reason']);
        $this->boundedString($this->payload['reason'], 'Provider stream cancellation reason', 512);
    }

    /** @param list<string> $expected */
    private function assertExactKeys(array $expected): void
    {
        $actual = array_keys($this->payload);
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw new InvalidArgumentException('Provider stream event payload has unexpected fields.');
        }
    }

    private function boundedString(mixed $value, string $label, int $limit): string
    {
        if (! is_string($value) || trim($value) === '' || strlen($value) > $limit) {
            throw new InvalidArgumentException("{$label} must be a non-empty bounded string.");
        }
        if (preg_match('//u', $value) !== 1) {
            throw new InvalidArgumentException("{$label} must be valid UTF-8.");
        }

        return $value;
    }
}
