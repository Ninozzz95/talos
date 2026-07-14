<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class TokenUsage
{
    public function __construct(
        public int $inputTokens,
        public int $outputTokens,
        public int $totalTokens,
        public int $cachedTokens = 0,
    ) {
        foreach ([$inputTokens, $outputTokens, $totalTokens, $cachedTokens] as $value) {
            if ($value < 0) {
                throw new InvalidArgumentException('Provider token usage values must be non-negative.');
            }
        }
    }

    /** @param array<string, mixed> $usage */
    public static function fromOpenAi(array $usage): self
    {
        $input = is_int($usage['prompt_tokens'] ?? null) ? $usage['prompt_tokens'] : 0;
        $output = is_int($usage['completion_tokens'] ?? null) ? $usage['completion_tokens'] : 0;
        $total = is_int($usage['total_tokens'] ?? null) ? $usage['total_tokens'] : $input + $output;
        $cached = is_int($usage['prompt_tokens_details']['cached_tokens'] ?? null)
            ? $usage['prompt_tokens_details']['cached_tokens']
            : 0;

        return new self($input, $output, $total, $cached);
    }

    /** @param array<string, mixed> $usage */
    public static function fromOpenAiResponses(array $usage): self
    {
        $input = is_int($usage['input_tokens'] ?? null) ? $usage['input_tokens'] : 0;
        $output = is_int($usage['output_tokens'] ?? null) ? $usage['output_tokens'] : 0;
        $total = is_int($usage['total_tokens'] ?? null) ? $usage['total_tokens'] : $input + $output;
        $cached = is_int($usage['input_tokens_details']['cached_tokens'] ?? null)
            ? $usage['input_tokens_details']['cached_tokens']
            : 0;

        return new self($input, $output, $total, $cached);
    }

    /** @param array<string, mixed> $usage */
    public static function fromAnthropic(array $usage): self
    {
        $input = is_int($usage['input_tokens'] ?? null) ? $usage['input_tokens'] : 0;
        $output = is_int($usage['output_tokens'] ?? null) ? $usage['output_tokens'] : 0;
        $cached = (is_int($usage['cache_read_input_tokens'] ?? null) ? $usage['cache_read_input_tokens'] : 0)
            + (is_int($usage['cache_creation_input_tokens'] ?? null) ? $usage['cache_creation_input_tokens'] : 0);

        return new self($input, $output, $input + $output, $cached);
    }

    /** @param array<string, mixed> $usage */
    public static function fromGemini(array $usage): self
    {
        $input = is_int($usage['promptTokenCount'] ?? null) ? $usage['promptTokenCount'] : 0;
        $output = is_int($usage['candidatesTokenCount'] ?? null) ? $usage['candidatesTokenCount'] : 0;
        $total = is_int($usage['totalTokenCount'] ?? null) ? $usage['totalTokenCount'] : $input + $output;
        $cached = is_int($usage['cachedContentTokenCount'] ?? null) ? $usage['cachedContentTokenCount'] : 0;

        return new self($input, $output, $total, $cached);
    }

    /** @return array<string, int> */
    public function toArray(): array
    {
        return [
            'input_tokens' => $this->inputTokens,
            'output_tokens' => $this->outputTokens,
            'total_tokens' => $this->totalTokens,
            'cached_tokens' => $this->cachedTokens,
        ];
    }
}
