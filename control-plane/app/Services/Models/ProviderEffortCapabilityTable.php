<?php

declare(strict_types=1);

namespace App\Services\Models;

/**
 * Canonical fallback for a model's reasoning-effort capability when the live
 * provider catalog does not advertise it (e.g. OpenAI-compatible providers that
 * return no per-model effort metadata).
 *
 * The live catalog always takes precedence over this table — see
 * TalosProviderModelCatalogItem::effortLevels(), populated from the provider's
 * own capabilities response. This table only fills the gap.
 *
 * Conservative by design: a model receives an effort ladder ONLY when its family
 * is known (from published provider docs) to accept one, so TALOS never sends an
 * effort parameter a provider would reject. Levels are a subset of the canonical
 * ladder (minimal < low < medium < high < xhigh < max). Validate against a fresh
 * research gate before promoting to real-provider acceptance.
 */
final class ProviderEffortCapabilityTable
{
    /**
     * @return array{effort_levels: list<string>, supports_thinking: bool}
     */
    public static function resolve(string $provider, string $model): array
    {
        $provider = strtolower(trim($provider));
        $model = strtolower(trim($model));

        return match ($provider) {
            // Anthropic normally advertises capabilities.effort via the catalog;
            // this covers the case where it is missing. Extended thinking is native.
            'anthropic' => self::hasAny($model, ['claude'])
                ? ['effort_levels' => ['low', 'medium', 'high'], 'supports_thinking' => true]
                : self::none(),
            // OpenAI reasoning families accept reasoning_effort; classic chat models do not.
            'openai' => self::hasAny($model, ['o1', 'o3', 'o4', 'gpt-5'])
                ? ['effort_levels' => ['minimal', 'low', 'medium', 'high'], 'supports_thinking' => false]
                : self::none(),
            'openrouter' => self::hasAny($model, ['o1', 'o3', 'o4', 'gpt-5', 'claude', 'gemini-2.5', 'deepseek-r', 'deepseek-reason'])
                ? ['effort_levels' => ['low', 'medium', 'high'], 'supports_thinking' => false]
                : self::none(),
            // Gemini 2.5 exposes a thinking budget driven by effort.
            'gemini' => self::hasAny($model, ['2.5', '2-5'])
                ? ['effort_levels' => ['low', 'medium', 'high', 'xhigh'], 'supports_thinking' => false]
                : self::none(),
            // DeepSeek reasoner variants only.
            'deepseek' => self::hasAny($model, ['reasoner', 'reason', '-r1', 'r1'])
                ? ['effort_levels' => ['medium', 'high'], 'supports_thinking' => false]
                : self::none(),
            default => self::none(),
        };
    }

    /**
     * @return array{effort_levels: list<string>, supports_thinking: bool}
     */
    private static function none(): array
    {
        return ['effort_levels' => [], 'supports_thinking' => false];
    }

    /**
     * @param  list<string>  $needles
     */
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
