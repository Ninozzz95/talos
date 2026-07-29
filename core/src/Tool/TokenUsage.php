<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class TokenUsage
{
    public int $cachedTokens;
    public ?int $cacheReadTokens;
    public ?int $cacheWriteTokens;
    public ?int $cacheMissTokens;
    public ?int $cacheWrite5mTokens;
    public ?int $cacheWrite1hTokens;

    public function __construct(
        public int $inputTokens,
        public int $outputTokens,
        public int $totalTokens,
        int $cachedTokens = 0,
        ?int $cacheReadTokens = null,
        ?int $cacheWriteTokens = null,
        ?int $cacheMissTokens = null,
        ?int $cacheWrite5mTokens = null,
        ?int $cacheWrite1hTokens = null,
    ) {
        foreach ([
            $inputTokens,
            $outputTokens,
            $totalTokens,
            $cachedTokens,
            $cacheReadTokens,
            $cacheWriteTokens,
            $cacheMissTokens,
            $cacheWrite5mTokens,
            $cacheWrite1hTokens,
        ] as $value) {
            if ($value !== null && $value < 0) {
                throw new InvalidArgumentException('Provider token usage values must be non-negative.');
            }
        }
        if ($cacheReadTokens !== null && $cachedTokens !== 0 && $cachedTokens !== $cacheReadTokens) {
            throw new InvalidArgumentException('Provider cached-token compatibility value must match cache reads.');
        }
        if (($cacheWrite5mTokens !== null || $cacheWrite1hTokens !== null)
            && $cacheWriteTokens !== null
            && ($cacheWrite5mTokens ?? 0) + ($cacheWrite1hTokens ?? 0) !== $cacheWriteTokens) {
            throw new InvalidArgumentException('Provider cache-write TTL breakdown must match total cache writes.');
        }

        $this->cacheReadTokens = $cacheReadTokens ?? ($cachedTokens > 0 ? $cachedTokens : null);
        $this->cachedTokens = $this->cacheReadTokens ?? $cachedTokens;
        $this->cacheWriteTokens = $cacheWriteTokens;
        $this->cacheMissTokens = $cacheMissTokens;
        $this->cacheWrite5mTokens = $cacheWrite5mTokens;
        $this->cacheWrite1hTokens = $cacheWrite1hTokens;
    }

    /** @param array<string, mixed> $usage */
    public static function fromArray(array $usage): self
    {
        $allowed = [
            'input_tokens',
            'output_tokens',
            'total_tokens',
            'cached_tokens',
            'cache_read_tokens',
            'cache_write_tokens',
            'cache_miss_tokens',
            'cache_write_5m_tokens',
            'cache_write_1h_tokens',
        ];
        foreach (array_keys($usage) as $field) {
            if (! is_string($field) || ! in_array($field, $allowed, true)) {
                throw new InvalidArgumentException('Provider token usage checkpoint contains an unknown field.');
            }
        }

        foreach (['input_tokens', 'output_tokens', 'total_tokens', 'cached_tokens'] as $field) {
            if (array_key_exists($field, $usage)
                && (! is_int($usage[$field]) || $usage[$field] < 0)) {
                throw new InvalidArgumentException("Provider token usage field {$field} must be a non-negative integer.");
            }
        }

        $cacheRead = self::nullableMetric($usage, 'cache_read_tokens');
        $cached = $usage['cached_tokens'] ?? 0;
        if (array_key_exists('cached_tokens', $usage)
            && array_key_exists('cache_read_tokens', $usage)
            && $cacheRead !== null
            && $cached !== $cacheRead) {
            throw new InvalidArgumentException('Provider cached-token compatibility value must match cache reads.');
        }

        return new self(
            inputTokens: $usage['input_tokens'] ?? 0,
            outputTokens: $usage['output_tokens'] ?? 0,
            totalTokens: $usage['total_tokens'] ?? 0,
            cachedTokens: $cached,
            cacheReadTokens: $cacheRead,
            cacheWriteTokens: self::nullableMetric($usage, 'cache_write_tokens'),
            cacheMissTokens: self::nullableMetric($usage, 'cache_miss_tokens'),
            cacheWrite5mTokens: self::nullableMetric($usage, 'cache_write_5m_tokens'),
            cacheWrite1hTokens: self::nullableMetric($usage, 'cache_write_1h_tokens'),
        );
    }

    /** @param array<string, mixed> $usage */
    public static function fromOpenAi(array $usage): self
    {
        $input = is_int($usage['prompt_tokens'] ?? null) ? $usage['prompt_tokens'] : 0;
        $output = is_int($usage['completion_tokens'] ?? null) ? $usage['completion_tokens'] : 0;
        $total = is_int($usage['total_tokens'] ?? null) ? $usage['total_tokens'] : $input + $output;
        $details = is_array($usage['prompt_tokens_details'] ?? null)
            ? $usage['prompt_tokens_details']
            : [];
        $openAiRead = self::nullableMetric($details, 'cached_tokens');
        $deepSeekRead = self::nullableMetric($usage, 'prompt_cache_hit_tokens');
        if ($openAiRead !== null && $deepSeekRead !== null && $openAiRead !== $deepSeekRead) {
            throw new InvalidArgumentException('Provider cache-read usage fields contradict each other.');
        }
        $read = $openAiRead ?? $deepSeekRead;
        $write = self::nullableMetric($details, 'cache_write_tokens');
        $miss = self::nullableMetric($usage, 'prompt_cache_miss_tokens');

        return new self($input, $output, $total, $read ?? 0, $read, $write, $miss);
    }

    /** @param array<string, mixed> $usage */
    public static function fromOpenAiResponses(array $usage): self
    {
        $input = is_int($usage['input_tokens'] ?? null) ? $usage['input_tokens'] : 0;
        $output = is_int($usage['output_tokens'] ?? null) ? $usage['output_tokens'] : 0;
        $total = is_int($usage['total_tokens'] ?? null) ? $usage['total_tokens'] : $input + $output;
        $details = is_array($usage['input_tokens_details'] ?? null)
            ? $usage['input_tokens_details']
            : [];
        $read = self::nullableMetric($details, 'cached_tokens');
        $write = self::nullableMetric($details, 'cache_write_tokens');

        return new self($input, $output, $total, $read ?? 0, $read, $write);
    }

    /** @param array<string, mixed> $usage */
    public static function fromAnthropic(array $usage): self
    {
        $uncachedInput = is_int($usage['input_tokens'] ?? null) ? $usage['input_tokens'] : 0;
        $output = is_int($usage['output_tokens'] ?? null) ? $usage['output_tokens'] : 0;
        $read = self::nullableMetric($usage, 'cache_read_input_tokens');
        $write = self::nullableMetric($usage, 'cache_creation_input_tokens');
        $creation = is_array($usage['cache_creation'] ?? null) ? $usage['cache_creation'] : [];
        $write5m = self::nullableMetric($creation, 'ephemeral_5m_input_tokens');
        $write1h = self::nullableMetric($creation, 'ephemeral_1h_input_tokens');
        if ($write === null && ($write5m !== null || $write1h !== null)) {
            $write = ($write5m ?? 0) + ($write1h ?? 0);
        }
        $input = $uncachedInput + ($read ?? 0) + ($write ?? 0);

        return new self(
            $input,
            $output,
            $input + $output,
            $read ?? 0,
            $read,
            $write,
            null,
            $write5m,
            $write1h,
        );
    }

    /** @param array<string, mixed> $usage */
    public static function fromGemini(array $usage): self
    {
        $input = is_int($usage['promptTokenCount'] ?? null) ? $usage['promptTokenCount'] : 0;
        $output = is_int($usage['candidatesTokenCount'] ?? null) ? $usage['candidatesTokenCount'] : 0;
        $total = is_int($usage['totalTokenCount'] ?? null) ? $usage['totalTokenCount'] : $input + $output;
        $read = self::nullableMetric($usage, 'cachedContentTokenCount');

        return new self($input, $output, $total, $read ?? 0, $read);
    }

    /**
     * @return array{
     *   input_tokens: int,
     *   output_tokens: int,
     *   total_tokens: int,
     *   cached_tokens: int,
     *   cache_read_tokens: ?int,
     *   cache_write_tokens: ?int,
     *   cache_miss_tokens: ?int,
     *   cache_write_5m_tokens: ?int,
     *   cache_write_1h_tokens: ?int
     * }
     */
    public function toArray(): array
    {
        return [
            'input_tokens' => $this->inputTokens,
            'output_tokens' => $this->outputTokens,
            'total_tokens' => $this->totalTokens,
            'cached_tokens' => $this->cachedTokens,
            'cache_read_tokens' => $this->cacheReadTokens,
            'cache_write_tokens' => $this->cacheWriteTokens,
            'cache_miss_tokens' => $this->cacheMissTokens,
            'cache_write_5m_tokens' => $this->cacheWrite5mTokens,
            'cache_write_1h_tokens' => $this->cacheWrite1hTokens,
        ];
    }

    /** @param array<string, mixed> $usage */
    private static function nullableMetric(array $usage, string $field): ?int
    {
        if (! array_key_exists($field, $usage) || $usage[$field] === null) {
            return null;
        }
        if (! is_int($usage[$field]) || $usage[$field] < 0) {
            throw new InvalidArgumentException("Provider token usage field {$field} must be a non-negative integer.");
        }

        return $usage[$field];
    }
}
