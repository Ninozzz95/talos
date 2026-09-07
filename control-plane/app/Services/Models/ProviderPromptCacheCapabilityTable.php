<?php

declare(strict_types=1);

namespace App\Services\Models;

use Kadmos\Provider\PromptCachePlan;

/**
 * Versioned, conservative provider/model prompt-cache capability fallback.
 *
 * This table only enables controls proven by current provider documentation.
 * Unknown models and OpenAI-compatible intermediaries fail closed because their
 * wire support cannot be inferred from a model-shaped name.
 */
final class ProviderPromptCacheCapabilityTable
{
    public const CONTRACT = 'talos.prompt_cache.capability.v1';

    /**
     * @return array{
     *   contract: string,
     *   supported: bool,
     *   minimum_input_tokens: ?int,
     *   modes: list<string>,
     *   ttls: list<string>,
     *   breakpoints: list<string>,
     *   usage_metrics: array{read: bool, write: bool, miss: bool}
     * }
     */
    public static function resolve(string $provider, string $model): array
    {
        $provider = strtolower(trim($provider));
        $model = self::normalizedModel($model);

        return match ($provider) {
            'openai' => self::openAi($model),
            'anthropic' => self::anthropic($model),
            'gemini' => self::gemini($model),
            'deepseek' => self::deepSeek($model),
            default => self::none(),
        };
    }

    /** @return array<string, mixed> */
    private static function openAi(string $model): array
    {
        if (preg_match('/^gpt-5-6(?:$|-)/', $model) === 1) {
            return self::capability(
                minimumInputTokens: 1024,
                modes: [
                    PromptCachePlan::MODE_PROVIDER_DEFAULT,
                    PromptCachePlan::MODE_AUTOMATIC,
                    PromptCachePlan::MODE_EXPLICIT,
                    PromptCachePlan::MODE_DISABLED,
                ],
                ttls: [PromptCachePlan::TTL_30_MINUTES],
                breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM, 'message'],
                read: true,
                write: true,
            );
        }

        if (preg_match('/^(?:gpt-4o|gpt-4-1|o1|o3|o4)(?:$|-)/', $model) === 1
            || $model === 'gpt-5'
            || preg_match('/^gpt-5-[0-5](?:$|-)/', $model) === 1) {
            return self::capability(
                minimumInputTokens: 1024,
                modes: [
                    PromptCachePlan::MODE_PROVIDER_DEFAULT,
                    PromptCachePlan::MODE_AUTOMATIC,
                ],
                read: true,
            );
        }

        return self::none();
    }

    /** @return array<string, mixed> */
    private static function anthropic(string $model): array
    {
        $minimum = match (true) {
            self::hasAny($model, ['claude-opus-5', 'claude-fable-5', 'claude-mythos-5']) => 512,
            self::hasAny($model, ['claude-mythos-preview', 'claude-opus-4-7']) => 2048,
            self::hasAny($model, ['claude-opus-4-6', 'claude-opus-4-5', 'claude-haiku-4-5']) => 4096,
            self::hasAny($model, [
                'claude-opus-4-8',
                'claude-sonnet-5',
                'claude-sonnet-4-6',
                'claude-sonnet-4-5',
                'claude-opus-4-1',
            ]) => 1024,
            default => null,
        };
        if ($minimum === null) {
            return self::none();
        }

        return self::capability(
            minimumInputTokens: $minimum,
            modes: [
                PromptCachePlan::MODE_PROVIDER_DEFAULT,
                PromptCachePlan::MODE_AUTOMATIC,
                PromptCachePlan::MODE_EXPLICIT,
                PromptCachePlan::MODE_DISABLED,
            ],
            ttls: [PromptCachePlan::TTL_5_MINUTES, PromptCachePlan::TTL_1_HOUR],
            breakpoints: [
                PromptCachePlan::BREAKPOINT_TOOLS,
                PromptCachePlan::BREAKPOINT_SYSTEM,
                'message',
            ],
            read: true,
            write: true,
        );
    }

    /** @return array<string, mixed> */
    private static function gemini(string $model): array
    {
        $minimum = match (true) {
            str_starts_with($model, 'gemini-3-5-flash'),
            str_starts_with($model, 'gemini-3-1-pro-preview') => 4096,
            str_starts_with($model, 'gemini-2-5-flash'),
            str_starts_with($model, 'gemini-2-5-pro') => 2048,
            default => null,
        };
        if ($minimum === null) {
            return self::none();
        }

        return self::capability(
            minimumInputTokens: $minimum,
            modes: [PromptCachePlan::MODE_PROVIDER_DEFAULT],
            read: true,
        );
    }

    /** @return array<string, mixed> */
    private static function deepSeek(string $model): array
    {
        if (! self::hasAny($model, ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4'])) {
            return self::none();
        }

        return self::capability(
            minimumInputTokens: null,
            modes: [PromptCachePlan::MODE_PROVIDER_DEFAULT],
            read: true,
            miss: true,
        );
    }

    /**
     * @param list<string> $modes
     * @param list<string> $ttls
     * @param list<string> $breakpoints
     * @return array{
     *   contract: string,
     *   supported: bool,
     *   minimum_input_tokens: ?int,
     *   modes: list<string>,
     *   ttls: list<string>,
     *   breakpoints: list<string>,
     *   usage_metrics: array{read: bool, write: bool, miss: bool}
     * }
     */
    private static function capability(
        ?int $minimumInputTokens,
        array $modes,
        array $ttls = [],
        array $breakpoints = [],
        bool $read = false,
        bool $write = false,
        bool $miss = false,
    ): array {
        return [
            'contract' => self::CONTRACT,
            'supported' => true,
            'minimum_input_tokens' => $minimumInputTokens,
            'modes' => $modes,
            'ttls' => $ttls,
            'breakpoints' => $breakpoints,
            'usage_metrics' => [
                'read' => $read,
                'write' => $write,
                'miss' => $miss,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function none(): array
    {
        return [
            'contract' => self::CONTRACT,
            'supported' => false,
            'minimum_input_tokens' => null,
            'modes' => [],
            'ttls' => [],
            'breakpoints' => [],
            'usage_metrics' => [
                'read' => false,
                'write' => false,
                'miss' => false,
            ],
        ];
    }

    private static function normalizedModel(string $model): string
    {
        $model = strtolower(trim($model));
        $model = str_replace(['.', '_'], '-', $model);

        return preg_replace('/-+/', '-', $model) ?? $model;
    }

    /** @param list<string> $needles */
    private static function hasAny(string $model, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($model, $needle)) {
                return true;
            }
        }

        return false;
    }
}
