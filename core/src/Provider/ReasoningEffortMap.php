<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;

/**
 * Pure, stateless translation of a canonical reasoning-effort selection into
 * provider-specific request parameters.
 *
 * This is the single source of truth shared by the typed turn adapters and the
 * legacy chat engine, so a given (target, effort, thinking, max_tokens) always
 * produces identical wire parameters regardless of which engine emits the turn.
 *
 * Canonical ladder, ascending intensity:
 *   off < minimal < low < medium < high < xhigh < max
 *
 * "off" (or null) means: emit no reasoning parameter at all. The per-model
 * subset of valid levels is enforced upstream (the composer offers only the
 * model's advertised effort_levels), so this map trusts any level it is given.
 */
final class ReasoningEffortMap
{
    /** The sentinel that disables reasoning entirely. */
    public const OFF = 'off';

    /** Ordered canonical reasoning levels (ascending intensity, excludes "off"). */
    public const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

    /** Adapter targets — each owns a distinct provider wire shape. */
    public const TARGET_OPENAI_CHAT = 'openai_chat';
    public const TARGET_OPENAI_RESPONSES = 'openai_responses';
    public const TARGET_ANTHROPIC = 'anthropic';
    public const TARGET_GEMINI = 'gemini';

    /** Thinking-token budget per level, for budget-based providers (Anthropic, Gemini). */
    private const BUDGET = [
        'minimal' => 1024,
        'low' => 4096,
        'medium' => 8192,
        'high' => 16384,
        'xhigh' => 24576,
        'max' => 32768,
    ];

    /** Anthropic's minimum viable thinking budget. */
    private const MIN_BUDGET = 1024;

    /** Tokens reserved for the response when sizing an Anthropic thinking budget below max_tokens. */
    private const OUTPUT_HEADROOM = 1024;

    /** Anthropic's implicit max_tokens when the request leaves it unset (mirrors the adapter default). */
    private const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

    /** Gemini's absolute thinking-budget cap. */
    private const GEMINI_MAX_BUDGET = 32768;

    /**
     * Resolve provider-specific reasoning parameters for a turn.
     *
     * @param  string       $target     one of the TARGET_* constants
     * @param  string|null  $effort     a canonical level, "off", or null
     * @param  bool         $thinking   whether extended/visible thinking is requested (only honoured where supported)
     * @param  int|null     $maxTokens  the turn's max output tokens, used to bound budget-based providers
     * @return array<string,mixed>      the reasoning params to merge into the provider payload (possibly empty)
     *
     * @throws InvalidArgumentException on an unknown level or an unknown target
     */
    public static function paramsFor(
        string $target,
        ?string $effort,
        bool $thinking = false,
        ?int $maxTokens = null,
    ): array {
        $level = self::normalizeLevel($effort);
        if ($level === null) {
            return [];
        }

        return match ($target) {
            self::TARGET_OPENAI_CHAT => ['reasoning_effort' => $level],
            self::TARGET_OPENAI_RESPONSES => ['reasoning' => ['effort' => $level]],
            self::TARGET_ANTHROPIC => self::anthropicParams($level, $thinking, $maxTokens),
            self::TARGET_GEMINI => ['thinkingConfig' => ['thinkingBudget' => self::geminiBudget($level)]],
            default => throw new InvalidArgumentException("Unknown reasoning-effort target: {$target}"),
        };
    }

    /**
     * @return string|null the normalized level, or null when reasoning is off/unset
     *
     * @throws InvalidArgumentException on an unrecognized level
     */
    private static function normalizeLevel(?string $effort): ?string
    {
        if ($effort === null) {
            return null;
        }

        $level = strtolower(trim($effort));
        if ($level === '' || $level === self::OFF) {
            return null;
        }

        if (! in_array($level, self::LEVELS, true)) {
            throw new InvalidArgumentException("Unknown reasoning-effort level: {$effort}");
        }

        return $level;
    }

    /**
     * @return array<string,mixed> the Anthropic thinking block, or empty when thinking is
     *                             not requested or cannot fit within max_tokens
     */
    private static function anthropicParams(string $level, bool $thinking, ?int $maxTokens): array
    {
        if (! $thinking) {
            return [];
        }

        $ceiling = ($maxTokens ?? self::ANTHROPIC_DEFAULT_MAX_TOKENS) - self::OUTPUT_HEADROOM;
        $budget = min(self::BUDGET[$level], $ceiling);
        if ($budget < self::MIN_BUDGET) {
            return [];
        }

        return ['thinking' => ['type' => 'enabled', 'budget_tokens' => $budget]];
    }

    private static function geminiBudget(string $level): int
    {
        return min(self::BUDGET[$level], self::GEMINI_MAX_BUDGET);
    }
}
